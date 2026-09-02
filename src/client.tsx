import React, { Component, type ElementType, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

performance.mark('devjar:client-start')

type RouteEntry = {
  module: string
  page: string
}

type RouteManifest = {
  version: 2
  liveReload: boolean
  revision: number
  routes: Record<string, RouteEntry>
  notFound: RouteEntry | undefined
}

type RouteModule = {
  default?: unknown
}

type ModuleExports = Record<string, unknown>

type RefreshRuntime = {
  createSignatureFunctionForTransform: (...args: unknown[]) => unknown
  injectIntoGlobalHook: (target: typeof globalThis) => void
  isLikelyComponentType: (value: unknown) => boolean
  performReactRefresh: () => unknown
  register: (type: unknown, id: string) => void
}

type HmrUpdate = {
  path: string
  url: string
  type: 'css' | 'refresh'
}

type HmrChange = {
  revision: number
  reload: boolean
  routes: boolean
  timestamp: number
  updates: HmrUpdate[]
}

type RegisteredModule = {
  exports: ModuleExports
  url: string
}

declare global {
  var __devjarRefreshRuntime: RefreshRuntime
  var __devjarRegisterModule: (
    path: string,
    url: string,
    exports: ModuleExports,
  ) => void
}

type ErrorBoundaryProps = {
  children?: ReactNode
  revision: number
}

type ErrorBoundaryState = {
  error: unknown
}

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
const reactRoot = createRoot(appRoot)

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.revision !== this.props.revision && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      const message = this.state.error instanceof Error
        ? this.state.error.message
        : String(this.state.error)
      return React.createElement('div', null, message)
    }
    return this.props.children
  }
}

let loadRevision = 0
let renderRevision = 0
let routeManifest: RouteManifest
const routeModules = new Map<string, Promise<RouteModule>>()
const registeredModules = new Map<string, RegisteredModule>()
const pendingModules = new Map<string, {
  previous: RegisteredModule
  next: RegisteredModule
}>()
const refreshRuntime = globalThis.__devjarRefreshRuntime as RefreshRuntime | undefined
let hmrQueue = Promise.resolve()

function normalizeRoute(route: string) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, '')
  return cleanRoute ? `/${cleanRoute}` : '/'
}

async function getRouteManifest(revision: number) {
  const url = new URL('/__devjar/routes.json', location.origin)
  if (revision) url.searchParams.set('v', String(revision))
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Unable to load routes')
  if (data.version !== 2) throw new Error(`Unsupported Devjar route manifest: ${data.version}`)
  return data as RouteManifest
}

function getRouteEntry(route: string) {
  return routeManifest.routes[normalizeRoute(route)] || routeManifest.notFound
}

function importRoute(entry: RouteEntry) {
  let promise = routeModules.get(entry.module)
  if (!promise) {
    promise = import(/* webpackIgnore: true */ /* @vite-ignore */ entry.module) as Promise<RouteModule>
    routeModules.set(entry.module, promise)
    promise.catch(() => routeModules.delete(entry.module))
  }
  return promise
}

function isRefreshRuntime(value: unknown): value is RefreshRuntime {
  if (typeof value !== 'object' || value === null) return false
  return 'injectIntoGlobalHook' in value
    && typeof value.injectIntoGlobalHook === 'function'
    && 'isLikelyComponentType' in value
    && typeof value.isLikelyComponentType === 'function'
    && 'performReactRefresh' in value
    && typeof value.performReactRefresh === 'function'
    && 'register' in value
    && typeof value.register === 'function'
}

function installModuleRegistration() {
  if (!refreshRuntime) return
  if (!isRefreshRuntime(refreshRuntime)) throw new Error('Devjar could not load React Refresh')
  globalThis.__devjarRegisterModule = (path, url, exports) => {
    for (const [name, value] of Object.entries(exports)) {
      if (refreshRuntime.isLikelyComponentType(value)) {
        refreshRuntime.register(value, `${path} export ${name}`)
      }
    }
    const next = { exports, url }
    const previous = registeredModules.get(path)
    registeredModules.set(path, next)
    if (previous && previous.url !== url) {
      pendingModules.set(path, { previous, next })
    }
  }
}

function acceptsRefresh(path: string) {
  if (!refreshRuntime) return false
  const update = pendingModules.get(path)
  if (!update) return false
  const previousNames = Object.keys(update.previous.exports)
  const nextNames = Object.keys(update.next.exports)
  if (previousNames.length !== nextNames.length) return false
  if (previousNames.some(name => !Object.prototype.hasOwnProperty.call(update.next.exports, name))) return false
  return nextNames.every(name => (
    refreshRuntime.isLikelyComponentType(update.previous.exports[name])
    && refreshRuntime.isLikelyComponentType(update.next.exports[name])
  ))
}

async function applyHmrChange(change: HmrChange) {
  const start = performance.now()
  if (change.reload) {
    location.reload()
    return
  }
  if (change.routes) routeManifest = await getRouteManifest(change.revision)
  if (!change.updates.length) return

  pendingModules.clear()
  const refreshUpdates: HmrUpdate[] = []
  for (const update of change.updates) {
    await import(/* webpackIgnore: true */ /* @vite-ignore */ update.url)
    if (update.type === 'refresh') refreshUpdates.push(update)
  }
  if (refreshUpdates.some(update => !acceptsRefresh(update.path))) {
    location.reload()
    return
  }
  if (refreshUpdates.length) {
    if (!refreshRuntime) {
      location.reload()
      return
    }
    refreshRuntime.performReactRefresh()
    hideError()
    dispatchEvent(new CustomEvent('devjar:render', {
      detail: {
        duration: performance.now() - start,
        totalDuration: Date.now() - change.timestamp,
        updates: change.updates,
      },
    }))
  }
}

function preloadRoute(route: string) {
  const entry = getRouteEntry(route)
  if (!entry || routeModules.has(entry.module)) return
  const preload = document.createElement('link')
  preload.rel = 'modulepreload'
  preload.href = entry.module
  document.head.appendChild(preload)
  void importRoute(entry).catch(() => {})
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

function isElementType(value: unknown): value is ElementType {
  return typeof value === 'string'
    || typeof value === 'function'
    || (typeof value === 'object' && value !== null)
}

async function load(route: string) {
  const revision = ++loadRevision
  try {
    const entry = getRouteEntry(route)
    if (!entry) throw new Error(`No page found for ${normalizeRoute(route)}`)
    const module = await importRoute(entry)
    if (revision !== loadRevision) return
    if (!isElementType(module.default)) {
      throw new Error(`Devjar page ${entry.page} must have a default React component export`)
    }

    renderRevision++
    reactRoot.render(React.createElement(
      ErrorBoundary,
      { revision: renderRevision },
      React.createElement(module.default),
    ))
    document.title = entry.page
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
  } catch (error) {
    if (revision === loadRevision) showError(error)
    throw error
  }
}

function routeAnchor(target: EventTarget | null) {
  const anchor = target instanceof Element
    ? target.closest<HTMLAnchorElement>('a[href]')
    : null
  if (!anchor) return
  const url = new URL(anchor.href, location.href)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__devjar/')) return
  if (/\.[^/]+$/.test(url.pathname)) return
  return { anchor, url }
}

function shouldNavigate(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return false
  return true
}

function navigate(event: MouseEvent) {
  const route = routeAnchor(event.target)
  if (!route || !shouldNavigate(event, route.anchor)) return
  if (route.url.pathname === location.pathname
    && route.url.search === location.search
    && route.url.hash) return

  event.preventDefault()
  history.pushState(null, '', route.url.pathname + route.url.search + route.url.hash)
  void load(route.url.pathname).catch(() => {})
}

function preloadNavigation(event: Event) {
  const route = routeAnchor(event.target)
  if (route) preloadRoute(route.url.pathname)
}

async function start() {
  installModuleRegistration()
  routeManifest = await getRouteManifest(0)
  document.addEventListener('click', navigate)
  document.addEventListener('pointerover', preloadNavigation)
  document.addEventListener('focusin', preloadNavigation)
  addEventListener('popstate', () => {
    void load(location.pathname).catch(() => {})
  })

  await load(location.pathname)
  if (routeManifest.liveReload) {
    const events = new EventSource('/__devjar/events')
    events.addEventListener('change', event => {
      const change = JSON.parse((event as MessageEvent).data) as HmrChange
      hmrQueue = hmrQueue.then(() => applyHmrChange(change)).catch(showError)
    })
  }
}

void start().catch(showError)
