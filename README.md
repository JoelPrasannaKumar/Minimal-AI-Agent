# Minimal AI Agent

A minimal AI agent web app built with React, TypeScript, Vite, LangChain, and Gemini 2.5 Flash.

The app includes a clean ChatGPT-style interface and a server-side LangChain agent with a small set of tools for calculations, time lookup, unit conversion, note memory, Wikipedia summaries, and weather.

## Features

- React + TypeScript frontend
- ChatGPT-inspired chat interface
- Gemini 2.5 Flash model via LangChain
- Server-side API key handling through Vite middleware
- Tool-using AI agent
- Local session note memory

## Agent Tools

The LangChain agent can use these tools:

- `calculator`: evaluates arithmetic expressions
- `current_time`: gets current date/time for an IANA timezone
- `unit_converter`: converts length, weight, and temperature units
- `remember_note`: stores a short note during the current dev-server session
- `recall_notes`: recalls stored notes
- `wikipedia`: searches Wikipedia and returns a short summary with source URL
- `weather`: gets current weather for a city/location using Open-Meteo

## Tech Stack

- React
- TypeScript
- Vite
- LangChain JS
- Google Gemini 2.5 Flash
- Wikipedia APIs
- Open-Meteo APIs

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the development server:

```bash
npm run dev
```

Open the app:

```text
http://127.0.0.1:5173
```

## Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Environment Variables

| Variable | Description |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key used by the server-side LangChain agent |

The `.env` file is ignored by git so your API key is not committed.

## Project Structure

```text
.
├── public/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── style.css
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Notes

- The agent endpoint is implemented inside `vite.config.ts` as local Vite middleware at `/api/chat`.
- Weather data is provided by Open-Meteo.
- Wikipedia summaries use public Wikimedia/Wikipedia APIs.
- Stored notes live only in memory and reset when the dev server restarts.
