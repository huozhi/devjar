'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DevJar, type PreviewStatus } from 'devjar'
import { jarFiles } from '../lib/examples/jar'
import { resolveModule } from '../lib/resolve-module'
import './mini-playground.css'

function preview(content: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body { margin: 0; height: 100vh; display: grid; place-items: center; background: #fffdf9; color: #292d24; font: 13px system-ui, sans-serif; }
    p { margin: 0; }
  </style></head><body>${content}</body></html>`
}

const textPreview = preview('<p>Welcome Home</p>')
const jarLoadingFrames = ['jar...', 'j#r...', 'ja*...', 'j?r...', 'jar...', 'jar...', 'jar...']

export function MiniPlayground() {
  const jar = useRef<HTMLIFrameElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [status, setStatus] = useState<PreviewStatus>('idle')
  const [error, setError] = useState<unknown>()
  const [pressed, setPressed] = useState(false)
  const [loadingFrame, setLoadingFrame] = useState(0)

  const launch = useCallback(() => {
    if (pressTimer.current) return
    setPressed(true)
    pressTimer.current = setTimeout(() => {
      jar.current?.contentWindow?.postMessage({ type: 'devjar-jar-toss' }, '*')
      setPressed(false)
      pressTimer.current = undefined
    }, 180)
  }, [])

  useEffect(() => {
    if (status !== 'ready' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let repeat: ReturnType<typeof setInterval> | undefined
    const first = setTimeout(() => {
      launch()
      repeat = setInterval(launch, 5000)
    }, 3300)
    return () => { clearTimeout(first); clearInterval(repeat) }
  }, [status, launch])

  useEffect(() => () => clearTimeout(pressTimer.current), [])

  useEffect(() => {
    if (status === 'ready' || error != null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = setInterval(() => setLoadingFrame(frame => (frame + 1) % jarLoadingFrames.length), 180)
    return () => clearInterval(interval)
  }, [status, error])

  return (
    <div className={`playground-showcase${status === 'ready' ? ' is-ready' : ''}`}>
      <div className="mini-playground" aria-label="Devjar code changes from text to a Launch button in a browser preview">
        <div className="mini-editor" aria-hidden="true">
          <div className="mini-file">pages/index.tsx</div>
          <div className="mini-code">
            <div><span className="mini-purple">export default</span> <span className="mini-blue">function</span> Page() {'{'}</div>
            <div>  <span className="mini-purple">return</span> (</div>
            <div className="mini-changing-line">
              <span className="mini-text-code">    &lt;p&gt;Welcome Home&lt;/p&gt;</span>
              <span className="mini-button-code">    &lt;button onClick={'{'}launch{'}'}&gt;Launch&lt;/button&gt;</span>
            </div>
            <div>  )</div>
            <div>{'}'}</div>
          </div>
        </div>
        <div className="mini-browser">
          <iframe className="mini-text-preview" title="Text preview" tabIndex={-1} sandbox="" srcDoc={textPreview} />
          <button className={`mini-launch${pressed ? ' is-pressed' : ''}`} onClick={launch} disabled={status !== 'ready'}>Launch</button>
        </div>
      </div>
      <div className="mini-jar" aria-label="Live cards in a jar" aria-busy={status !== 'ready'}>
        <DevJar ref={jar} files={jarFiles} tailwind={false} resolveModule={resolveModule}
          title="Live cards in a jar" onStatusChange={setStatus} onError={setError} />
        {status !== 'ready' && error == null && <span className="mini-loading" role="status" aria-label="Loading jar"><span aria-hidden="true">{jarLoadingFrames[loadingFrame]}</span></span>}
        {error != null && <span className="mini-loading" role="alert">Jar preview unavailable</span>}
      </div>
    </div>
  )
}
