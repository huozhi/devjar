'use client'

import { useEffect, useRef, useState } from 'react'

const tabs = [
  { id: 'prompt', label: 'Prompt', text: 'Build a website with Devjar. Follow https://devjar.vercel.app/llms.txt' },
  { id: 'install', label: 'Install', text: 'npm install devjar' },
  { id: 'cli', label: 'CLI', text: 'npx devjar dev' },
]

export function Banner() {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => () => clearTimeout(timeout.current), [])

  function select(index: number) {
    setActive(index)
    setCopied(false)
    setCopyError(false)
    clearTimeout(timeout.current)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(tabs[active].text)
      setCopied(true)
      setCopyError(false)
      clearTimeout(timeout.current)
      timeout.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <section className="intro-section">
      <nav className="intro-links" aria-label="Project links">
        <a href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15A10.8 10.8 0 0 1 12 6.16c.96 0 1.92.13 2.82.38 2.15-1.46 3.09-1.15 3.09-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.28-5.14 5.56.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.77.54A11.25 11.25 0 0 0 12 .75Z" /></svg>
        </a>
        <a href="https://x.com/huozhi" target="_blank" rel="noopener noreferrer" aria-label="X" title="X">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-7.4L5.6 22H2.47l7.99-9.14L.8 2h6.4l4.42 6.76L18.9 2Zm-1.1 18h1.73L6.26 3.9H4.4L17.8 20Z" /></svg>
        </a>
      </nav>
      <h1>devjar</h1>
      <p className="intro-copy">Live Playground &amp; Static Site Export</p>
      <p className="intro-agents">Designed for agents. Zero Config</p>
      <div className="intro-command">
        <div className="intro-command-tabs" role="tablist" aria-label="Get started">
          {tabs.map((tab, index) => <button key={tab.id} ref={node => { buttons.current[index] = node }}
            role="tab" id={`start-tab-${tab.id}`} aria-controls={`start-panel-${tab.id}`} aria-selected={active === index}
            tabIndex={active === index ? 0 : -1} onClick={() => select(index)}
            onKeyDown={event => {
              const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined
              if (next === undefined) return
              event.preventDefault()
              select(next)
              buttons.current[next]?.focus()
            }}>{tab.label}</button>)}
        </div>
        {tabs.map((tab, index) => <div key={tab.id} role="tabpanel" id={`start-panel-${tab.id}`}
          aria-labelledby={`start-tab-${tab.id}`} hidden={active !== index} tabIndex={0} className="intro-command-panel">
          <code>{tab.text}</code>
        </div>)}
        <button className="intro-command-copy" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${tabs[active].label.toLowerCase()}`} title={copied ? 'Copied' : 'Copy'}>
          {copied ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg>}
        </button>
        <span className="intro-command-status" role="status">{copyError ? 'Select the text to copy it.' : copied ? 'Copied' : ''}</span>
      </div>
    </section>
  )
}
