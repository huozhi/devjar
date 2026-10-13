import { FileTree } from '@sugar-high/react'
import { taffy } from '@sugar-high/react/themes'
import { flushSync } from 'react-dom'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Footer } from '../components/footer'
import { HomeLink } from '../components/home-link'
import { SiteNav } from '../components/site-nav'
import '../styles.css'
import '../markdown-demo.css'
import '../markdown-browser.css'

const themes = [
  { id: 'minimal', pages: ['index.md', 'workflow.md', 'changes.md'], name: 'Minimal', description: 'Room to breathe.' },
  { id: 'github', pages: ['index.md', 'api.md', 'recipes.md'], name: 'GitHub', description: 'Made for documentation.' },
  { id: 'editorial', pages: ['index.md', 'waiting.md', 'morning.md'], name: 'Editorial', description: 'For slower reading.' },
  { id: 'academic', pages: ['index.md', 'method.md', 'results.md'], name: 'Academic', description: 'Notes, data, and equations.' },
] as const

type Example = (typeof themes)[number]

function transition(change: () => void) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => flushSync(change))
  } else flushSync(change)
}

export default function MarkdownDemo() {
  const [selected, setSelected] = useState<Example>(themes[0])
  const [expanded, setExpanded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const browserBody = useRef<HTMLDivElement>(null)
  const [activeFile, setActiveFile] = useState('pages/index.md')
  const [sidebarPercent, setSidebarPercent] = useState(24)
  const [resizing, setResizing] = useState(false)
  const [stacked, setStacked] = useState(false)
  useEffect(() => {
    const query = matchMedia('(max-width: 650px)')
    const update = () => setStacked(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const navigate = (path: string) => {
    const file = path.replace(/^pages\//, '')
    if (!selected.pages.some(page => page === file)) return
    const base = `/markdown-previews/${selected.id}/`
    const destination = file === 'index.md' ? base : `${base}${file.slice(0, -3)}/`
    if (frame.current?.contentWindow?.location.pathname !== destination) {
      frame.current?.contentWindow?.location.assign(destination)
    }
  }
  const syncNavigation = () => {
    const path = frame.current?.contentWindow?.location.pathname
    const page = path?.slice(`/markdown-previews/${selected.id}/`.length).replace(/\/$/, '')
    const file = page ? `${page}.md` : 'index.md'
    if (selected.pages.some(page => page === file)) setActiveFile(`pages/${file}`)
  }
  const resizeSidebar = (clientX: number, clientY: number) => {
    const bounds = browserBody.current?.getBoundingClientRect()
    if (bounds) {
      const ratio = stacked ? (clientY - bounds.top) / bounds.height : (clientX - bounds.left) / bounds.width
      setSidebarPercent(Math.max(10, Math.min(65, ratio * 100)))
    }
  }

  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded])

  const open = (example: Example) => {
    flushSync(() => setSelected(example))
    setFullscreen(false)
    setActiveFile('pages/index.md')
    transition(() => setExpanded(true))
  }

  const close = () => transition(() => { setExpanded(false); setFullscreen(false) })

  return <>
    <title>Markdown themes — Devjar</title>
    <meta name="description" content="Four Markdown themes. Open a preview to explore its pages." />
    <main className="markdown-demo">
      <HomeLink />
      <SiteNav active="markdown" />
      <div className="markdown-fragments">{themes.map(theme => <section key={theme.id} className="markdown-example" aria-labelledby={`theme-${theme.id}`}>
        <div className="markdown-preview" style={{ viewTransitionName: !expanded && selected.id === theme.id ? 'example-browser' : undefined }}>
          <iframe className="markdown-fragment-preview" title={`${theme.name} preview`} src={`/markdown-previews/${theme.id}/`} loading="lazy" tabIndex={-1} aria-hidden="true" />
          <button type="button" aria-label={`Open ${theme.name}`} onClick={() => open(theme)} />
        </div>
        <div className="markdown-fragment-intro">
          <h2 id={`theme-${theme.id}`}>{theme.name}</h2>
          <p>{theme.description}</p>
        </div>
      </section>)}</div>
    </main>
    <Footer />

    {expanded && <>
      <button className="example-backdrop" type="button" aria-label="Close browser" onClick={close} />
      <section className={`example-browser${fullscreen ? ' is-fullscreen' : ''}`} aria-label={`${selected.name} browser`} style={{ viewTransitionName: 'example-browser' }}>
        <div className="example-browser-topbar">
          <div className="example-window-controls">
            <button type="button" onClick={close} aria-label="Close browser" />
            <span aria-hidden="true" />
          </div>
          <button className="example-browser-expand" type="button" onClick={() => stacked ? close() : transition(() => setFullscreen(value => !value))} aria-label={stacked ? 'Exit fullscreen' : fullscreen ? 'Exit fullscreen' : 'Expand browser'} aria-pressed={!stacked && fullscreen}>
            {stacked || fullscreen
              ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M9 3v6H3m12 12v-6h6M9 9 3 3m12 12 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        </div>
        <div ref={browserBody} className={`example-browser-body${resizing ? ' is-resizing' : ''}`} style={{ '--sidebar-width': `${sidebarPercent}%` } as CSSProperties}>
          <aside className="example-browser-sidebar" aria-label="Pages">
            <FileTree paths={selected.pages.map(page => `pages/${page}`)} activeFile={activeFile} onActiveFileChange={navigate} theme={taffy.light} />
          </aside>
          <div className="example-browser-divider" role="separator" aria-label="Resize page sidebar" aria-orientation={stacked ? 'horizontal' : 'vertical'} aria-valuemin={10} aria-valuemax={65} aria-valuenow={Math.round(sidebarPercent)} tabIndex={0}
            onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true) }}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeSidebar(event.clientX, event.clientY) }}
            onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); setResizing(false) }}
            onLostPointerCapture={() => setResizing(false)}
            onKeyDown={event => {
              const decrease = stacked ? 'ArrowUp' : 'ArrowLeft'
              const increase = stacked ? 'ArrowDown' : 'ArrowRight'
              if (![decrease, increase, 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              setSidebarPercent(value => event.key === 'Home' ? 10 : event.key === 'End' ? 65 : Math.max(10, Math.min(65, value + (event.key === increase ? 3 : -3))))
            }}
          />
          <div className="example-browser-content">
            <iframe ref={frame} title={`${selected.name} website`} src={`/markdown-previews/${selected.id}/`} onLoad={syncNavigation} />
          </div>
        </div>
      </section>
    </>}
  </>
}
