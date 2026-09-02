import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DevJar } from 'devjar'

type Project = {
  files: Record<string, string>
  dependencies: Record<string, string>
  page: string
}

async function getProject(route: string): Promise<Project> {
  const response = await fetch('/__devjar/project?route=' + encodeURIComponent(route))
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Unable to load project')
  return data
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.stack || error.message
  return String(error)
}

function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState<unknown>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const load = useCallback((route = location.pathname) => {
    getProject(route).then(value => {
      setProject(value)
      setError(null)
    }, setError)
  }, [])

  useEffect(() => {
    load()
    const events = new EventSource('/__devjar/events')
    const reload = () => load(location.pathname)
    const navigateHistory = () => load(location.pathname)
    events.addEventListener('change', reload)
    addEventListener('popstate', navigateHistory)
    return () => {
      events.removeEventListener('change', reload)
      events.close()
      removeEventListener('popstate', navigateHistory)
    }
  }, [load])

  useEffect(() => {
    const iframe = previewRef.current
    if (!iframe) return
    let previewDocument: Document | null = null
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href]')
        : null
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__devjar/')) return
      if (/\.[^/]+$/.test(url.pathname)) return
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return
      event.preventDefault()
      history.pushState(null, '', url.pathname + url.search + url.hash)
      load(url.pathname)
    }
    const connect = () => {
      if (previewDocument === iframe.contentDocument) return
      previewDocument?.removeEventListener('click', navigate)
      previewDocument = iframe.contentDocument
      previewDocument?.addEventListener('click', navigate)
    }
    connect()
    iframe.addEventListener('devjar:render', connect)
    return () => {
      iframe.removeEventListener('devjar:render', connect)
      previewDocument?.removeEventListener('click', navigate)
    }
  }, [project?.page, load])

  if (!project) {
    return error ? <pre className="devjar-error">{errorMessage(error)}</pre> : null
  }

  return (
    <>
      <DevJar
        files={project.files}
        dependencies={project.dependencies}
        transform={false}
        onError={value => setError(value || null)}
        title={project.page}
        ref={previewRef}
      />
      {error && <pre className="devjar-error">{errorMessage(error)}</pre>}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
