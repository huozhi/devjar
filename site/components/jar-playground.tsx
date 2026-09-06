'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { DevJar, type PreviewStatus } from 'devjar'
import { jarFiles, jarSettings } from '../lib/examples/jar'
import { resolveModule } from '../lib/resolve-module'
import './jar-playground.css'

export function JarPlayground() {
  const [settings, setSettings] = useState(jarSettings)
  const [appliedSettings, setAppliedSettings] = useState(jarSettings)
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<PreviewStatus>('idle')
  const [error, setError] = useState<unknown>()
  const container = useRef<HTMLDivElement>(null)
  const files = useMemo(() => ({ ...jarFiles, 'jar.json': JSON.stringify(appliedSettings) }), [appliedSettings])
  const busy = status === 'idle' || status === 'loading' || status === 'compiling'

  useEffect(() => {
    const timeout = setTimeout(() => setAppliedSettings(settings), 50)
    return () => clearTimeout(timeout)
  }, [settings])

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setEnabled(true); observer.disconnect() }
    }, { rootMargin: '300px' })
    observer.observe(container.current!)
    return () => observer.disconnect()
  }, [])

  return <div className="jar-playground" ref={container}>
    <div className="jar-controls">
      <div className="jar-controls-heading"><span>Make it your own</span>
        <button onClick={() => setSettings(jarSettings)}>Reset</button>
      </div>
      <div className="jar-sliders">
      <label htmlFor="jar-throw">Toss height <output>{settings.throw.toFixed(1)}</output>
        <input id="jar-throw" type="range" aria-orientation="vertical" min="1" max="5" step="0.1" value={settings.throw}
          onChange={event => setSettings(current => ({ ...current, throw: event.target.valueAsNumber }))} />
      </label>
      <label htmlFor="jar-gravity">Fall speed <output>{settings.gravity.toFixed(1)}</output>
        <input id="jar-gravity" type="range" aria-orientation="vertical" min="3" max="16" step="0.5" value={settings.gravity}
          onChange={event => setSettings(current => ({ ...current, gravity: event.target.valueAsNumber }))} />
      </label>
      <label htmlFor="jar-glass">Glass clarity <output>{Math.round((1 - settings.glass) * 100)}%</output>
        <input id="jar-glass" type="range" aria-orientation="vertical" min="40" max="100" step="1" value={Math.round((1 - settings.glass) * 100)}
          onChange={event => setSettings(current => ({ ...current, glass: 1 - event.target.valueAsNumber / 100 }))} />
      </label>
      </div>
      <p>Click the jar to toss the cards.</p>
    </div>
    <div className="jar-preview" aria-busy={busy}>
      {enabled && <DevJar files={files} tailwind={false} resolveModule={resolveModule} title="Cards in a jar" onStatusChange={setStatus}
        onError={error => setError(error)} />}
      {busy && <div className="jar-loading" role="status"><span>Setting things in motion…</span></div>}
      {error != null && <pre className="jar-status" role="alert">{String(error)}</pre>}
    </div>
  </div>
}
