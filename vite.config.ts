import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { createAgent, tool } from 'langchain'
import { z } from 'zod'

type ChatMessage = {
  role: 'user' | 'model'
  text: string
}

const noteMemory: string[] = []

async function readJsonBody(request: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object' && 'text' in part) {
          return String(part.text)
        }

        return ''
      })
      .join('')
  }

  return ''
}

function calculateExpression(expression: string) {
  const compact = expression.trim()

  if (!compact || compact.length > 120) {
    throw new Error('Expression must be between 1 and 120 characters.')
  }

  if (!/^[\d\s+\-*/().%^]+$/.test(compact)) {
    throw new Error('Only numbers, parentheses, and arithmetic operators are supported.')
  }

  const normalized = compact.replaceAll('^', '**')
  const value = Function(`"use strict"; return (${normalized})`)()

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expression did not produce a finite number.')
  }

  return value
}

const lengthUnits = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
}

const weightUnits = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
}

const unitValues = [
  'mm',
  'cm',
  'm',
  'km',
  'in',
  'ft',
  'yd',
  'mi',
  'mg',
  'g',
  'kg',
  'oz',
  'lb',
  'c',
  'f',
  'k',
] as const

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{
      title: string
    }>
  }
}

type WikipediaSummaryResponse = {
  title?: string
  extract?: string
  content_urls?: {
    desktop?: {
      page?: string
    }
  }
}

type GeocodingResponse = {
  results?: Array<{
    name: string
    latitude: number
    longitude: number
    country?: string
    admin1?: string
    timezone?: string
  }>
}

type WeatherResponse = {
  current?: {
    time?: string
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    precipitation?: number
    weather_code?: number
    wind_speed_10m?: number
  }
  current_units?: Record<string, string>
}

function convertUnit(value: number, from: (typeof unitValues)[number], to: (typeof unitValues)[number]) {
  if (from in lengthUnits && to in lengthUnits) {
    const meters = value * lengthUnits[from as keyof typeof lengthUnits]
    return meters / lengthUnits[to as keyof typeof lengthUnits]
  }

  if (from in weightUnits && to in weightUnits) {
    const grams = value * weightUnits[from as keyof typeof weightUnits]
    return grams / weightUnits[to as keyof typeof weightUnits]
  }

  if (['c', 'f', 'k'].includes(from) && ['c', 'f', 'k'].includes(to)) {
    const celsius =
      from === 'c' ? value : from === 'f' ? ((value - 32) * 5) / 9 : value - 273.15

    if (to === 'c') {
      return celsius
    }

    if (to === 'f') {
      return (celsius * 9) / 5 + 32
    }

    return celsius + 273.15
  }

  throw new Error(`Cannot convert from ${from} to ${to}. Use compatible unit families.`)
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AI Agent Project/1.0 (local development)',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} ${response.statusText}.`)
  }

  return (await response.json()) as T
}

async function searchWikipedia(query: string, language: string) {
  const wikiLanguage = language.toLowerCase().replace(/[^a-z-]/g, '') || 'en'
  const searchUrl = new URL(`https://${wikiLanguage}.wikipedia.org/w/api.php`)

  searchUrl.searchParams.set('action', 'query')
  searchUrl.searchParams.set('list', 'search')
  searchUrl.searchParams.set('srsearch', query)
  searchUrl.searchParams.set('srlimit', '1')
  searchUrl.searchParams.set('format', 'json')

  const searchData = await fetchJson<WikipediaSearchResponse>(searchUrl.toString())
  const title = searchData.query?.search?.[0]?.title

  if (!title) {
    return `No Wikipedia result found for "${query}".`
  }

  const summaryUrl = new URL(
    `https://${wikiLanguage}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
  )
  const summary = await fetchJson<WikipediaSummaryResponse>(summaryUrl.toString())
  const pageUrl = summary.content_urls?.desktop?.page

  return [
    summary.title ?? title,
    summary.extract ?? 'No summary extract was available.',
    pageUrl ? `Source: ${pageUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function describeWeatherCode(code?: number) {
  const descriptions: Record<number, string> = {
    0: 'clear sky',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'fog',
    48: 'depositing rime fog',
    51: 'light drizzle',
    53: 'moderate drizzle',
    55: 'dense drizzle',
    61: 'slight rain',
    63: 'moderate rain',
    65: 'heavy rain',
    71: 'slight snow',
    73: 'moderate snow',
    75: 'heavy snow',
    80: 'slight rain showers',
    81: 'moderate rain showers',
    82: 'violent rain showers',
    95: 'thunderstorm',
    96: 'thunderstorm with slight hail',
    99: 'thunderstorm with heavy hail',
  }

  return code === undefined ? 'unknown conditions' : (descriptions[code] ?? `weather code ${code}`)
}

async function getCurrentWeather(location: string) {
  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')

  geocodeUrl.searchParams.set('name', location)
  geocodeUrl.searchParams.set('count', '1')
  geocodeUrl.searchParams.set('language', 'en')
  geocodeUrl.searchParams.set('format', 'json')

  const geocode = await fetchJson<GeocodingResponse>(geocodeUrl.toString())
  const place = geocode.results?.[0]

  if (!place) {
    return `No weather location found for "${location}".`
  }

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')

  weatherUrl.searchParams.set('latitude', String(place.latitude))
  weatherUrl.searchParams.set('longitude', String(place.longitude))
  weatherUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
  )
  weatherUrl.searchParams.set('timezone', place.timezone ?? 'auto')

  const weather = await fetchJson<WeatherResponse>(weatherUrl.toString())
  const current = weather.current

  if (!current) {
    return `Weather data was not available for ${place.name}.`
  }

  const units = weather.current_units ?? {}
  const region = [place.name, place.admin1, place.country].filter(Boolean).join(', ')

  return [
    `Current weather for ${region}: ${describeWeatherCode(current.weather_code)}.`,
    `Temperature: ${current.temperature_2m}${units.temperature_2m ?? ' C'}; feels like ${current.apparent_temperature}${units.apparent_temperature ?? ' C'}.`,
    `Humidity: ${current.relative_humidity_2m}${units.relative_humidity_2m ?? '%'}; precipitation: ${current.precipitation}${units.precipitation ?? ' mm'}.`,
    `Wind: ${current.wind_speed_10m}${units.wind_speed_10m ?? ' km/h'}.`,
    current.time ? `Observed/model time: ${current.time}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function createTools() {
  const calculator = tool(
    ({ expression }) => {
      const value = calculateExpression(expression)

      return `${expression} = ${value}`
    },
    {
      name: 'calculator',
      description:
        'Evaluate arithmetic expressions. Supports numbers, parentheses, +, -, *, /, %, and ^.',
      schema: z.object({
        expression: z.string().describe('Arithmetic expression to evaluate.'),
      }),
    },
  )

  const currentTime = tool(
    ({ timeZone }) => {
      const zone = timeZone || 'Asia/Calcutta'

      try {
        return new Intl.DateTimeFormat('en-US', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: zone,
        }).format(new Date())
      } catch {
        return `Invalid time zone "${zone}". Try an IANA zone like Asia/Calcutta or America/New_York.`
      }
    },
    {
      name: 'current_time',
      description: 'Get the current date and time for a given IANA time zone.',
      schema: z.object({
        timeZone: z.string().optional().describe('IANA time zone, for example Asia/Calcutta.'),
      }),
    },
  )

  const unitConverter = tool(
    ({ value, from, to }) => {
      const converted = convertUnit(value, from, to)

      return `${value} ${from} = ${converted} ${to}`
    },
    {
      name: 'unit_converter',
      description:
        'Convert length, weight, or temperature units. Length: mm cm m km in ft yd mi. Weight: mg g kg oz lb. Temperature: c f k.',
      schema: z.object({
        value: z.number().describe('Numeric value to convert.'),
        from: z.enum(unitValues).describe('Source unit.'),
        to: z.enum(unitValues).describe('Target unit.'),
      }),
    },
  )

  const rememberNote = tool(
    ({ note }) => {
      noteMemory.push(note)

      return `Remembered note ${noteMemory.length}: ${note}`
    },
    {
      name: 'remember_note',
      description:
        'Store a short user-provided note in server memory for this running dev-server session.',
      schema: z.object({
        note: z.string().min(1).max(500).describe('Short note to remember.'),
      }),
    },
  )

  const recallNotes = tool(
    () => {
      if (!noteMemory.length) {
        return 'No notes stored yet.'
      }

      return noteMemory.map((note, index) => `${index + 1}. ${note}`).join('\n')
    },
    {
      name: 'recall_notes',
      description: 'Recall notes stored with remember_note during this server session.',
      schema: z.object({}),
    },
  )

  const wikipedia = tool(
    ({ query, language }) => searchWikipedia(query, language ?? 'en'),
    {
      name: 'wikipedia',
      description:
        'Search Wikipedia and return a concise article summary with a source URL. Use for encyclopedia-style background facts.',
      schema: z.object({
        query: z.string().min(1).describe('Topic to search on Wikipedia.'),
        language: z.string().optional().describe('Wikipedia language code, default en.'),
      }),
    },
  )

  const weather = tool(
    ({ location }) => getCurrentWeather(location),
    {
      name: 'weather',
      description:
        'Get current weather for a city or location using geocoding plus current forecast data.',
      schema: z.object({
        location: z.string().min(2).describe('City or place name, for example Mumbai or London.'),
      }),
    },
  )

  return [calculator, currentTime, unitConverter, rememberNote, recallNotes, wikipedia, weather]
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY

  return {
    plugins: [
      react(),
      {
        name: 'langchain-agent-api',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (request, response) => {
            if (request.method !== 'POST') {
              response.statusCode = 405
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            if (!geminiApiKey) {
              response.statusCode = 500
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY in your environment.' }))
              return
            }

            try {
              const body = (await readJsonBody(request)) as { messages?: ChatMessage[] }
              const messages = body.messages ?? []

              if (!messages.length || messages[messages.length - 1]?.role !== 'user') {
                response.statusCode = 400
                response.setHeader('Content-Type', 'application/json')
                response.end(JSON.stringify({ error: 'A user message is required.' }))
                return
              }

              const llm = new ChatGoogleGenerativeAI({
                apiKey: geminiApiKey,
                model: 'gemini-2.5-flash',
                temperature: 0.4,
              })
              const agent = createAgent({
                model: llm,
                tools: createTools(),
                systemPrompt:
                  'You are a helpful AI agent. Use tools when they improve accuracy. Keep answers concise, explain tool results naturally, and say when a requested action is outside your available tools.',
              })
              const result = await agent.invoke({
                messages: messages.map((message) => ({
                  role: message.role === 'model' ? 'assistant' : 'user',
                  content: message.text,
                })),
              }, {
                recursionLimit: 8,
              })
              const latest = result.messages.at(-1)
              const text = extractText(latest?.content)

              response.statusCode = 200
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ text: text || 'The agent finished without a text response.' }))
            } catch (error) {
              const message = error instanceof Error ? error.message : 'LangChain agent request failed.'

              response.statusCode = 500
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: message }))
            }
          })
        },
      },
    ],
  }
})
