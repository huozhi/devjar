import { createEsmShResolver } from './_cdn'
import { createRenderer, linkModules } from './core'
import { createModule } from './module'

performance.mark('devjar:client-start')

type Project = {
  files: Record<string, string>
  dependencies: Record<string, string>
  cdn: string
  liveReload: boolean
  page: string
  tailwind: boolean
}

const tailwindSrc = 'https://unpkg.com/@tailwindcss/browser@4'

function getRoot(id: string) {
  const root = document.getElementById(id)
  if (!root) throw new Error(`Devjar could not find #${id}`)
  return root
}

const hostRoot = getRoot('root')
const errorRoot = getRoot('__devjarError')

const appRoot = document.createElement('div')
appRoot.id = '__reactRoot'
hostRoot.appendChild(appRoot)

let loadRevision = 0
let moduleResolver = (_specifier: string): string => {
  throw new Error('Devjar module resolution is not initialized')
}
let tailwindReady: Promise<void> | undefined
const render = createRenderer(createModule, specifier => moduleResolver(specifier))

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

function showError(error: unknown) {
  errorRoot.textContent = errorMessage(error)
  errorRoot.hidden = false
}

function hideError() {
  errorRoot.hidden = true
  errorRoot.textContent = ''
}

function loadTailwind(enabled: boolean) {
  if (!enabled) return Promise.resolve()
  if (tailwindReady) return tailwindReady

  tailwindReady = new Promise<void>(resolvePromise => {
    const script = document.createElement('script')
    const ready = () => resolvePromise()
    script.src = tailwindSrc
    script.addEventListener('load', ready, { once: true })
    script.addEventListener('error', ready, { once: true })
    document.head.appendChild(script)
  })
  return tailwindReady
}

async function load(route: string) {
  const revision = ++loadRevision
  try {
    const project = await getProject(route)
    if (revision !== loadRevision) return project

    moduleResolver = createEsmShResolver(project.dependencies, project.cdn)
    const linked = await linkModules(project.files, moduleResolver)
    await loadTailwind(project.tailwind)
    if (revision !== loadRevision) return project

    await render(linked.files, linked.dependencies)
    if (revision === loadRevision) {
      document.title = project.page
      hideError()
      if (!performance.getEntriesByName('devjar:first-render').length) {
        performance.mark('devjar:first-render')
        performance.measure(
          'devjar:first-render',
          'devjar:client-start',
          'devjar:first-render',
        )
      }
      dispatchEvent(new CustomEvent('devjar:render'))
    }
    return project
  } catch (error) {
    if (revision === loadRevision) showError(error)
    throw error
  }
}

function shouldNavigate(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return false
  return true
}

function navigate(event: MouseEvent) {
  const target = event.target
  const anchor = target instanceof Element
    ? target.closest<HTMLAnchorElement>('a[href]')
    : null
  if (!anchor || !shouldNavigate(event, anchor)) return

  const url = new URL(anchor.href, location.href)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__devjar/')) return
  if (/\.[^/]+$/.test(url.pathname)) return
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return

  event.preventDefault()
  history.pushState(null, '', url.pathname + url.search + url.hash)
  void load(url.pathname).catch(() => {})
}

async function start() {
  document.addEventListener('click', navigate)
  addEventListener('popstate', () => {
    void load(location.pathname).catch(() => {})
  })

  const project = await load(location.pathname)
  if (project.liveReload) {
    const events = new EventSource('/__devjar/events')
    events.addEventListener('change', () => {
      void load(location.pathname).catch(() => {})
    })
  }
}

void start().catch(() => {})
