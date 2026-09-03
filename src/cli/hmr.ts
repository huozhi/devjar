import type { HmrChange, HmrUpdate } from './protocol'

type ModuleExports = Record<string, unknown>

type RefreshRuntime = {
  createSignatureFunctionForTransform: (...args: unknown[]) => unknown
  injectIntoGlobalHook: (target: typeof globalThis) => void
  isLikelyComponentType: (value: unknown) => boolean
  performReactRefresh: () => unknown
  register: (type: unknown, id: string) => void
}

type RegisteredModule = {
  exports: ModuleExports
  url: string
}

type HotUpdaterOptions = {
  refreshRuntime: unknown
  reloadRoutes: (revision: number) => Promise<void>
  onRefresh: (detail: {
    duration: number
    totalDuration: number
    updates: HmrUpdate[]
  }) => void
}

declare global {
  var __jarRefreshRuntime: RefreshRuntime
  var __jarRegisterModule: (
    path: string,
    url: string,
    exports: ModuleExports,
  ) => void
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

export function createHotUpdater(options: HotUpdaterOptions) {
  if (!isRefreshRuntime(options.refreshRuntime)) {
    throw new Error('Devjar could not load React Refresh')
  }

  const refreshRuntime = options.refreshRuntime
  const registeredModules = new Map<string, RegisteredModule>()
  const pendingModules = new Map<string, {
    previous: RegisteredModule
    next: RegisteredModule
  }>()
  let queue = Promise.resolve()

  globalThis.__jarRegisterModule = (path, url, exports) => {
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

  function acceptsRefresh(path: string) {
    const update = pendingModules.get(path)
    if (!update) return false
    const previousNames = Object.keys(update.previous.exports)
    const nextNames = Object.keys(update.next.exports)
    if (previousNames.length !== nextNames.length) return false
    if (previousNames.some(name => !Object.prototype.hasOwnProperty.call(update.next.exports, name))) {
      return false
    }
    return nextNames.every(name => (
      refreshRuntime.isLikelyComponentType(update.previous.exports[name])
      && refreshRuntime.isLikelyComponentType(update.next.exports[name])
    ))
  }

  async function apply(change: HmrChange) {
    const start = performance.now()
    if (change.reload) {
      location.reload()
      return
    }
    if (change.routes) await options.reloadRoutes(change.revision)
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
    if (!refreshUpdates.length) return

    refreshRuntime.performReactRefresh()
    options.onRefresh({
      duration: performance.now() - start,
      totalDuration: Date.now() - change.timestamp,
      updates: change.updates,
    })
  }

  return {
    enqueue(change: HmrChange, onError: (error: unknown) => void) {
      queue = queue.then(() => apply(change)).catch(onError)
    },
  }
}
