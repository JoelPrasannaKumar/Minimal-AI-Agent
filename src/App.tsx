import { useMemo, useRef, useState } from 'react'

type ChatMessage = {
  id: string
  role: 'user' | 'model'
  text: string
}

const menuItems = ['Minimal AI Agent', 'Preferences', 'Window', 'Edit', 'View', 'Help']

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label}>
      {children}
    </button>
  )
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const apiMessages = useMemo(
    () => messages.map(({ role, text }) => ({ role, text })),
    [messages],
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const text = input.trim()

    if (!text || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setError('')
    setIsSending(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...apiMessages, { role: 'user', text }],
        }),
      })
      const data = (await response.json()) as { text?: string; error?: string }

      if (!response.ok) {
        throw new Error(data.error ?? 'Gemini request failed.')
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'model',
          text: data.text?.trim() || 'I did not receive a response.',
        },
      ])
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Something went wrong.'

      setError(message)
    } finally {
      setIsSending(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <div className="desktop-shell">
      <header className="window-titlebar">
        <div className="title-left">
          <span className="tiny-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3.3a4.1 4.1 0 0 1 3.7 2.3 4.2 4.2 0 0 1 4 6.2 4.2 4.2 0 0 1-1.6 6 4.1 4.1 0 0 1-6.1 2.2 4.1 4.1 0 0 1-6.1-2.2 4.2 4.2 0 0 1-1.6-6 4.2 4.2 0 0 1 4-6.2A4.1 4.1 0 0 1 12 3.3Z" />
              <path d="M8.4 6.3 15.6 10v8M17.9 8.3 12 11.5 6.1 8.3M5.9 15.7l6.1-3.2 6.1 3.2M8.4 17.7V10l7.2-3.7" />
            </svg>
          </span>
          <span>Minimal AI Agent</span>
        </div>
        <div className="window-controls" aria-hidden="true">
          <span>-</span>
          <span>□</span>
          <span>×</span>
        </div>
      </header>

      <nav className="menu-bar" aria-label="Application menu">
        {menuItems.map((item) => (
          <button type="button" key={item}>
            {item}
          </button>
        ))}
      </nav>

      <div className="app-frame">
        <aside className="sidebar" aria-label="Sidebar">
          <div className="sidebar-top">
            <IconButton label="Home">
              <svg viewBox="0 0 24 24">
                <path d="M12 3.3a4.1 4.1 0 0 1 3.7 2.3 4.2 4.2 0 0 1 4 6.2 4.2 4.2 0 0 1-1.6 6 4.1 4.1 0 0 1-6.1 2.2 4.1 4.1 0 0 1-6.1-2.2 4.2 4.2 0 0 1-1.6-6 4.2 4.2 0 0 1 4-6.2A4.1 4.1 0 0 1 12 3.3Z" />
                <path d="M8.4 6.3 15.6 10v8M17.9 8.3 12 11.5 6.1 8.3M5.9 15.7l6.1-3.2 6.1 3.2M8.4 17.7V10l7.2-3.7" />
              </svg>
            </IconButton>
            <IconButton label="New chat">
              <svg viewBox="0 0 24 24">
                <path d="M12 5H7.7A2.7 2.7 0 0 0 5 7.7v8.6A2.7 2.7 0 0 0 7.7 19h8.6a2.7 2.7 0 0 0 2.7-2.7V12" />
                <path d="M14 5h5v5M19 5l-8 8" />
              </svg>
            </IconButton>
            <IconButton label="Search">
              <svg viewBox="0 0 24 24">
                <circle cx="10.7" cy="10.7" r="6.7" />
                <path d="m16 16 4 4" />
              </svg>
            </IconButton>
            <IconButton label="Chats">
              <svg viewBox="0 0 24 24">
                <path d="M4.5 12a7.5 7.5 0 0 1 7.8-7.5A7.4 7.4 0 0 1 19.5 12a7.4 7.4 0 0 1-7.5 7.5 8.6 8.6 0 0 1-3.1-.6L4.7 20l1-3.6A7.2 7.2 0 0 1 4.5 12Z" />
              </svg>
            </IconButton>
          </div>

          <button className="profile-chip" type="button" aria-label="Profile">
            JY
          </button>
        </aside>

        <main className={`chat-surface ${messages.length ? 'has-messages' : ''}`}>
          <header className="chat-header">
            <button className="model-button" type="button">
              LangChain Agent
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            <button className="focus-button" type="button" aria-label="Focus">
              <svg viewBox="0 0 24 24">
                <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              </svg>
            </button>
          </header>

          <section className="hero-chat" aria-label="Gemini chat">
            {!messages.length && <h1>Where should we begin?</h1>}

            {!!messages.length && (
              <div className="message-list" aria-live="polite">
                {messages.map((message) => (
                  <article className={`message ${message.role}`} key={message.id}>
                    <p>{message.text}</p>
                  </article>
                ))}
                {isSending && (
                  <article className="message model">
                    <p className="typing">Thinking...</p>
                  </article>
                )}
              </div>
            )}

            <form className="composer" onSubmit={handleSubmit}>
              <button className="composer-icon" type="button" aria-label="Add">
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <input
                ref={inputRef}
                aria-label="Message"
                placeholder="Ask anything"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <button className="composer-icon mic" type="button" aria-label="Voice input">
                <svg viewBox="0 0 24 24">
                  <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
                </svg>
              </button>
              <button className="voice-button" type="submit" aria-label="Send message" disabled={isSending}>
                <span />
                <span />
                <span />
                <span />
              </button>
            </form>

            {error && <p className="error-message">{error}</p>}

            {!messages.length && (
              <div className="quick-actions">
                <button type="button" onClick={() => setInput('Use the calculator tool for ')}>
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="3" width="14" height="18" rx="2" />
                    <path d="M8 7h8M8 11h2M12 11h2M16 11h.1M8 15h2M12 15h2M16 15h.1" />
                  </svg>
                  Calculate
                </button>
                <button type="button" onClick={() => setInput('What time is it in ')}>
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  Current time
                </button>
                <button type="button" onClick={() => setInput('Convert ')}>
                  <svg viewBox="0 0 24 24">
                    <path d="M7 7h10l-3-3M17 17H7l3 3M17 7 7 17" />
                  </svg>
                  Convert units
                </button>
                <button type="button" onClick={() => setInput('Search Wikipedia for ')}>
                  <svg viewBox="0 0 24 24">
                    <path d="M4 5h16M6 5l3 14M18 5l-3 14M8 15h8" />
                  </svg>
                  Wikipedia
                </button>
                <button type="button" onClick={() => setInput('What is the weather in ')}>
                  <svg viewBox="0 0 24 24">
                    <path d="M7 18h9a4 4 0 0 0 .7-7.9A5.5 5.5 0 0 0 6.2 8.2 4.8 4.8 0 0 0 7 18Z" />
                    <path d="M8 21h8" />
                  </svg>
                  Weather
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
