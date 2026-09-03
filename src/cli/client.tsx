import React, { Component, type ElementType, type ReactNode } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { createHotUpdater } from './hmr'
import type { HmrChange, RouteEntry, RouteManifest } from './protocol'

performance.mark('devjar:client-start')

type RouteModule = {
  default?: unknown
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
let appRoot = document.getElementById('__reactRoot')
if (!appRoot) {
  appRoot = document.createElement('div')
  appRoot.id = '__reactRoot'
  hostRoot.appendChild(appRoot)
}
let reactRoot: Root | undefined

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

function syncDefaultTitle() {
  requestAnimationFrame(() => {
    const defaultTitle = document.head.querySelector('title[data-devjar-default]')
    const pageTitle = document.head.querySelector('title:not([data-devjar-default])')
    if (pageTitle) {
      defaultTitle?.remove()
      return
    }
    if (defaultTitle) return

    const title = document.createElement('title')
    title.dataset.devjarDefault = ''
    title.textContent = 'Devjar'
    document.head.appendChild(title)
  })
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
    const page = React.createElement(
      ErrorBoundary,
      { revision: renderRevision },
      React.createElement(module.default),
    )
    if (!reactRoot && !routeManifest.liveReload && appRoot.hasChildNodes()) {
      reactRoot = hydrateRoot(appRoot, page, { onRecoverableError: showError })
    } else {
      if (!reactRoot) reactRoot = createRoot(appRoot)
      reactRoot.render(page)
    }
    syncDefaultTitle()
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
  routeManifest = await getRouteManifest(0)
  const hotUpdater = routeManifest.liveReload
    ? createHotUpdater({
        refreshRuntime: globalThis.__devjarRefreshRuntime,
        reloadRoutes: async revision => {
          routeManifest = await getRouteManifest(revision)
        },
        onRefresh: detail => {
          syncDefaultTitle()
          hideError()
          dispatchEvent(new CustomEvent('devjar:render', { detail }))
        },
      })
    : undefined
  document.addEventListener('click', navigate)
  document.addEventListener('pointerover', preloadNavigation)
  document.addEventListener('focusin', preloadNavigation)
  addEventListener('popstate', () => {
    void load(location.pathname).catch(() => {})
  })

  await load(location.pathname)
  if (hotUpdater) {
    const events = new EventSource('/__devjar/events')
    events.addEventListener('change', event => {
      const change = JSON.parse((event as MessageEvent).data) as HmrChange
      hotUpdater.enqueue(change, showError)
    })
  }
}

void start().catch(showError)
