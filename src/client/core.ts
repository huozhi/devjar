import { textModuleSuffix, isTextImport, createTextModule } from '../text'
import { createFrameSession, type FrameSession } from './frame'
import { createLoadQueue } from './load-queue'
import { createJsonModule } from '../json'
import { useEffect, useCallback, useState, useMemo, useRef } from 'react'
import { createModule } from './module'
import type { ModuleRuntime } from './module'
import { getCompilerWorkerUrl, type CompilerAssets } from './compiler'
import { createTransformPool, type TransformClient } from './transform-pool'
import { init, parse } from 'es-module-lexer'
import { createPreviewResolver } from '../cdn'
import { routeFromPagePath, sourceExtensions } from '../project'

export type PreviewStatus = 'idle' | 'compiling' | 'loading' | 'ready' | 'failed'

type ResolveModule = (specifier: string) => string
export type IframeRouteManifest = {
  routes: Record<string, string>
  notFound: string | undefined
}

let esModuleLexerInit = false
const isRelative = (specifier: string) => specifier.startsWith('./') || specifier.startsWith('../')
const localImportPrefix = '__DEVJAR_LOCAL_IMPORT__'
const localExtensions = [...sourceExtensions, '.css', '.json']

function createLocalImportPlaceholder(moduleKey: string) {
  return `${localImportPrefix}${encodeURIComponent(moduleKey)}__`
}

function normalizeProjectPath(filename: string) {
  const parts: string[] = []
  for (const part of filename.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) throw new Error(`devjar: File escapes the project root: ${filename}`)
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.join('/')
}

async function createTransformWorker(url: string | undefined) {
  if (!url) throw new Error('devjar: compiler worker URL is required')
  return new globalThis.Worker(url, { type: 'module', name: 'devjar-transform' })
}

const acquireTransformClient = createTransformPool(createTransformWorker)

function getModuleKey(filename: string) {
  return `@${normalizeProjectPath(filename)}`
}

function resolveRelativePath(importer: string, imported: string) {
  const parts = normalizeProjectPath(importer).split('/')
  parts.pop()

  for (const part of imported.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) {
        throw new Error(`devjar: Local import escapes the project root: ${imported}`)
      }
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.join('/')
}

function resolveRelativeModule(
  importer: string,
  imported: string,
  localFiles: ReadonlyMap<string, string>,
  text: boolean,
) {
  const requestedPath = resolveRelativePath(importer, imported)
  const candidates = text || /\.[^/]+$/.test(requestedPath)
    ? [requestedPath]
    : [
        ...localExtensions.map(extension => requestedPath + extension),
        ...localExtensions.map(extension => `${requestedPath}/index${extension}`),
      ]
  for (const candidate of candidates) {
    const moduleKey = localFiles.get(candidate)
    if (moduleKey) return moduleKey
  }
  throw new Error(`devjar: Cannot resolve ${imported} imported by ${importer}`)
}

function replaceImports(
  source: string,
  filename: string,
  moduleKey: string,
  resolveModule: ResolveModule,
  localFiles: ReadonlyMap<string, string>,
) {
  let code = ''
  let lastIndex = 0
  let hasReactImports = false
  const [imports] = parse(source)
  const cssImports: string[] = []
  const dependencies: string[] = []

  // start, end, statementStart, statementEnd, assertion, name
  imports.forEach(imported => {
    const { s, e, ss, se, n, d } = imported
    if (!n) return
    code += source.slice(lastIndex, ss) // content from last import to beginning of this line

    const text = isTextImport(source, imported)
    if (text && !isRelative(n)) throw new Error('Text imports must reference a local file: ' + n)
    const resolvedKey = isRelative(n)
      ? resolveRelativeModule(filename, n, localFiles, text)
      : undefined

    const localModuleKey = resolvedKey ? resolvedKey + (text ? textModuleSuffix : '') : undefined

    // handle imports
    if (localModuleKey && localModuleKey.endsWith('.css')) {
      // Map './styles.css' -> '@styles.css', and collect it
      cssImports.push(localModuleKey)
    } else if (text && localModuleKey) {
      const placeholder = createLocalImportPlaceholder(localModuleKey)
      code += source.substring(ss, s) + (d < 0 ? placeholder + source.substring(e, e + 1) : JSON.stringify(placeholder) + ')')
    } else {
      code += source.substring(ss, s)
      code += localModuleKey
        ? createLocalImportPlaceholder(localModuleKey)
        : resolveModule(n)
      code += source.substring(e, se)
    }
    if (localModuleKey) dependencies.push(localModuleKey)
    lastIndex = se

    if (n === 'react') {
      const statement = source.slice(ss, se)
      if (statement.includes('React')) {
        hasReactImports = true
      }
    }

  })

  if (cssImports.length) {
    cssImports.forEach((cssPath, index) => {
      code += `\nimport __devjarSheet${index} from "${createLocalImportPlaceholder(cssPath)}";\n`
    })
    code += `globalThis.__devjarStyleSheets ||= new Map();\n`
    cssImports.forEach((cssPath, index) => {
      code += `{ const previous = globalThis.__devjarStyleSheets.get(${JSON.stringify(cssPath)});\n`
      code += `const sheets = [...document.adoptedStyleSheets];\n`
      code += `const sheetIndex = sheets.indexOf(previous);\n`
      code += `if (sheetIndex < 0) sheets.push(__devjarSheet${index}); else sheets[sheetIndex] = __devjarSheet${index};\n`
      code += `document.adoptedStyleSheets = sheets;\n`
      code += `globalThis.__devjarStyleSheets.set(${JSON.stringify(cssPath)}, __devjarSheet${index}); }\n`
    })
  }

  code += source.substring(lastIndex)

  if (!hasReactImports) {
    code = `import React from ${JSON.stringify(resolveModule('react'))};\n${code}`
  }

  code = `const $RefreshReg$ = (type, id) => globalThis.__devjarRefreshRuntime.register(type, ${JSON.stringify(moduleKey + ' ')} + id);\n` +
    `const $RefreshSig$ = globalThis.__devjarRefreshRuntime.createSignatureFunctionForTransform;\n` +
    code

  return { code, dependencies }
}

async function linkModules(
  files: Record<string, string>,
  resolveModule: ResolveModule,
  rawFiles: Record<string, string>,
) {
  if (!esModuleLexerInit) {
    await init
    esModuleLexerInit = true
  }

  const localFiles = new Map(
    Object.keys(rawFiles).map(filename => [normalizeProjectPath(filename), getModuleKey(filename)]),
  )
  const dependencies: Record<string, string[]> = {}
  const linkedFiles: Record<string, string> = {}

  for (const [filename, source] of Object.entries(files)) {
    const moduleKey = getModuleKey(filename)
    if (filename.endsWith('.css')) {
      linkedFiles[moduleKey] = source
      dependencies[moduleKey] = []
      continue
    }

    if (filename.endsWith('.json')) {
      linkedFiles[moduleKey] = createJsonModule(filename, source)
      dependencies[moduleKey] = []
      continue
    }

    const linked = replaceImports(
      source,
      filename,
      moduleKey,
      resolveModule,
      localFiles,
    )
    linkedFiles[moduleKey] = linked.code
    dependencies[moduleKey] = linked.dependencies
    for (const dependency of linked.dependencies) {
      if (!dependency.endsWith(textModuleSuffix)) continue
      const originalKey = dependency.slice(0, -textModuleSuffix.length)
      const originalFile = Object.keys(rawFiles).find(path => getModuleKey(path) === originalKey)!
      linkedFiles[dependency] = createTextModule(rawFiles[originalFile])
      dependencies[dependency] = []
    }
  }

  return { files: linkedFiles, dependencies }
}

function createIframeRouteManifest(files: Record<string, string>): IframeRouteManifest {
  const routes: Record<string, string> = {}
  let notFound: string | undefined

  for (const filename of Object.keys(files).sort()) {
    const projectPath = normalizeProjectPath(filename)
    if (!projectPath.startsWith('pages/')) continue
    const pagePath = projectPath.slice('pages/'.length)
    const route = routeFromPagePath(pagePath)
    if (!route) continue
    if (routes[route]) {
      throw new Error(`devjar: Multiple pages resolve to ${route}`)
    }
    routes[route] = getModuleKey(projectPath)
    if (route === '/404' && !pagePath.includes('/')) {
      notFound = routes[route]
    }
  }

  if (!routes['/']) {
    // Keep existing single-file projects working while pages/ is canonical.
    const legacyEntry = sourceExtensions
      .map(extension => `index${extension}`)
      .find(filename => filename in files || `./${filename}` in files)
    if (legacyEntry) routes['/'] = getModuleKey(legacyEntry)
    else throw new Error('devjar: Expected an index page in pages/')
  }

  return { routes, notFound }
}

// This function is stringified into the iframe runtime.
function createRenderer(createModule_: typeof createModule, resolveModule: ResolveModule) {
  function isElementType(value: unknown): value is React.ElementType {
    return typeof value === 'string'
      || typeof value === 'function'
      || (typeof value === 'object' && value !== null)
  }

  interface ErrorBoundaryProps {
    revision: number
    children?: React.ReactNode
    ref?: React.Ref<ErrorBoundaryInstance>
  }

  interface ErrorBoundaryState {
    error: unknown
  }

  type ErrorBoundaryInstance = React.Component<ErrorBoundaryProps, ErrorBoundaryState> & {
    reset(): void
  }

  type ErrorBoundaryClass = React.ComponentClass<ErrorBoundaryProps, ErrorBoundaryState> & {
    new (props: ErrorBoundaryProps): ErrorBoundaryInstance
  }

  let reactRoot: import('react-dom/client').Root | undefined
  let ErrorBoundary: ErrorBoundaryClass | undefined
  let errorBoundary: ErrorBoundaryInstance | null = null
  let reactModuleUrl = ''
  let reactDomModuleUrl = ''
  let rendererModules: Promise<[
    typeof import('react'),
    typeof import('react-dom/client'),
    typeof import('react-dom'),
  ]> | undefined
  let disposed = false
  let renderRequestId = 0
  let renderQueue = Promise.resolve()
  let revision = 0
  const moduleRuntime: ModuleRuntime = {}
  let currentFiles: Record<string, string> = {}
  let currentDependencies: Record<string, string[]> = {}
  let currentManifest: IframeRouteManifest | undefined
  let currentRoute = '/'
  let renderedEntry = ''
  const setErrorBoundaryRef = (value: ErrorBoundaryInstance | null) => {
    errorBoundary = value
  }

  async function renderCurrent(
    files: Record<string, string>,
    dependencies: Record<string, string[]>,
    manifest: IframeRouteManifest,
    requestId: number,
    beforeCommit: () => void,
  ) {
    const cleanRoute = currentRoute.replace(/^\/+|\/+$/g, '')
    const route = cleanRoute ? `/${cleanRoute}` : '/'
    const entry = manifest.routes[route] || manifest.notFound
    const result = entry
      ? await createModule_(files, {
          resolveModule,
          dependencies,
          runtime: moduleRuntime,
          entry,
        })
      : undefined
    const nextReactModuleUrl = resolveModule('react')
    const nextReactDomModuleUrl = resolveModule('react-dom/client')
    if (!rendererModules
      || reactModuleUrl !== nextReactModuleUrl
      || reactDomModuleUrl !== nextReactDomModuleUrl) {
      reactModuleUrl = nextReactModuleUrl
      reactDomModuleUrl = nextReactDomModuleUrl
      // Preserve bundler ignore hints: these imports execute in the iframe.
      rendererModules = Promise.all([
        import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ reactModuleUrl),
        import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ reactDomModuleUrl),
        import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ resolveModule('react-dom')),
      ])
    }
    const [ReactMod, ReactDOMMod, { flushSync }] = await rendererModules
    if (disposed || requestId !== renderRequestId) return

    const _jsx = ReactMod.createElement
    const root = document.getElementById('__reactRoot')
    if (!root) throw new Error('devjar: render root was not found')
    let App: React.ElementType
    if (entry) {
      if (!isElementType(result?.module.default)) {
        throw new Error(`devjar: Page ${entry.slice(1)} must have a default React component export`)
      }
      App = result.module.default
    } else {
      App = function NotFound() {
        return _jsx('main', null,
          _jsx('h1', null, '404'),
          _jsx('p', null, `No page found for ${route}`),
        )
      }
    }
    const renderedPage = entry || `__devjar_not_found__${route}`

    if (!ErrorBoundary) {
      ErrorBoundary = class extends ReactMod.Component<ErrorBoundaryProps, ErrorBoundaryState> {
        constructor(props: ErrorBoundaryProps) {
          super(props)
          this.state = { error: null }
        }
        static getDerivedStateFromError(error: unknown) {
          return { error }
        }
        reset() {
          if (this.state.error) this.setState({ error: null })
        }
        componentDidCatch(error: unknown) {
          document.dispatchEvent(new CustomEvent('devjar:error', { detail: error }))
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
            return _jsx('div', null, message)
          }
          return this.props.children
        }
      }
    }

    beforeCommit()
    flushSync(() => {
      if (!reactRoot) {
        reactRoot = ReactDOMMod.createRoot(root)
        revision++
        reactRoot.render(_jsx(
          ErrorBoundary!,
          { revision, ref: setErrorBoundaryRef },
          _jsx(App)
        ))
        renderedEntry = renderedPage
        moduleRuntime.hasRendered = true
        return
      }

      if (renderedEntry !== renderedPage) {
        revision++
        renderedEntry = renderedPage
        errorBoundary?.reset()
        reactRoot.render(_jsx(
          ErrorBoundary!,
          { revision, ref: setErrorBoundaryRef },
          _jsx(App)
        ))
        return
      }

      if (result?.changed) {
        const recovering = Boolean(errorBoundary?.state.error)
        errorBoundary?.reset()
        const refreshRuntime = moduleRuntime.refreshRuntime
        if (!refreshRuntime) throw new Error('devjar: refresh runtime was not initialized')
        const refreshUpdate = refreshRuntime.performReactRefresh()
        const mountedRootCount = typeof refreshRuntime._getMountedRootCount === 'function'
          ? refreshRuntime._getMountedRootCount()
          : 0

        if (recovering || !refreshUpdate || mountedRootCount === 0) {
          revision++
          reactRoot.render(_jsx(
            ErrorBoundary!,
            { revision, ref: setErrorBoundaryRef },
            _jsx(App)
          ))
        }
      }
    })
    if (errorBoundary?.state.error) throw errorBoundary.state.error
  }

  function render(
    files: Record<string, string>,
    dependencies: Record<string, string[]>,
    manifest: IframeRouteManifest,
    beforeCommit: () => void,
  ) {
    if (disposed) return Promise.resolve()
    const requestId = ++renderRequestId
    currentFiles = files
    currentDependencies = dependencies
    currentManifest = manifest
    const pendingRender = renderQueue.then(() => {
      if (disposed || requestId !== renderRequestId) return
      return renderCurrent(files, dependencies, manifest, requestId, beforeCommit)
    })
    renderQueue = pendingRender.catch(() => {})
    return pendingRender
  }

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[href]')
      : null
    if (!anchor || anchor.hasAttribute('download')) return
    if (anchor.target && anchor.target !== '_self') return
    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#')) return
    const url = new URL(href, `https://devjar.local${currentRoute}`)
    if (url.origin !== 'https://devjar.local') return
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__devjar/')) return
    if (/\.[^/]+$/.test(url.pathname)) return

    event.preventDefault()
    currentRoute = url.pathname
    if (currentManifest) {
      void render(currentFiles, currentDependencies, currentManifest, () => {})
    }
  }
  document.addEventListener('click', onClick)

  render.dispose = () => {
    if (disposed) return
    disposed = true
    document.removeEventListener('click', onClick)
    renderRequestId++
    reactRoot?.unmount()
    reactRoot = undefined
  }
  return render
}

function createMainScript() {
  return `(() => {
'use strict';
const script = document.currentScript;
if (!script?.isConnected) return;
const createModule = ${createModule.toString()};
const createRenderer = ${createRenderer.toString()};
script.dispatchEvent(new CustomEvent('devjar:initialize', {
  detail: resolveModule => createRenderer(createModule, resolveModule),
}));
})();`
}

function useLiveCode({
  resolveModule: customResolveModule,
  dependencies,
  transform = true,
  tailwind = true,
  transformWorkerUrl,
  compiler,
}: {
  resolveModule?: (specifier: string) => string
  dependencies?: Record<string, string>
  transform?: boolean
  tailwind?: boolean
  transformWorkerUrl?: string | URL
  compiler?: CompilerAssets
}) {
  // Equal dependency/asset values must not reload a preview merely because a
  // parent creates fresh options objects while handling status notifications.
  const dependenciesKey = JSON.stringify(Object.entries(dependencies || {}).sort(([a], [b]) => a.localeCompare(b)))
  const resolveModule = useMemo(
    () => customResolveModule || createPreviewResolver(Object.fromEntries(JSON.parse(dependenciesKey))),
    [customResolveModule, dependenciesKey]
  )
  const workerUrl = compiler?.workerUrl.toString()
  const bindingUrl = compiler?.bindingUrl.toString()
  const wasmUrl = compiler?.wasmUrl.toString()
  const legacyUrl = compiler ? undefined : transformWorkerUrl?.toString()
  const transformKey = JSON.stringify([transform, workerUrl, bindingUrl, wasmUrl, legacyUrl])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [{ error, status }, setPreview] = useState<{ error: unknown; status: PreviewStatus }>({ error: undefined, status: 'idle' })
  const sessionRef = useRef<FrameSession | undefined>(undefined)
  const transformClientRef = useRef<TransformClient | undefined>(undefined)
  const transformCacheRef = useRef<{ key: string; files: Map<string, { source: string; code: string }> } | undefined>(undefined)
  const loadQueueRef = useRef(createLoadQueue())
  const lastLoadRef = useRef<{ files: Record<string, string>; promise: Promise<void> } | undefined>(undefined)
  const pendingResetRef = useRef<Promise<void> | undefined>(undefined)
  const loadIdRef = useRef(0)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const queue = createLoadQueue()
    loadQueueRef.current = queue
    const session = createFrameSession(iframe, {
      script: createMainScript(),
      resolveModule,
      tailwind,
      onError: error => setPreview({ error, status: 'failed' }),
    })
    sessionRef.current = session
    setPreview({ error: undefined, status: 'idle' })
    return () => {
      loadIdRef.current++
      loadQueueRef.current.clear()
      session.dispose()
      transformClientRef.current?.release()
      transformClientRef.current = undefined
      pendingResetRef.current = undefined
      if (sessionRef.current === session) sessionRef.current = undefined
    }
  }, [resolveModule, tailwind])

  const transformFiles = useCallback((files: Record<string, string>) => {
    if (!transformClientRef.current) {
      const assets = workerUrl === undefined ? undefined : { workerUrl, bindingUrl: bindingUrl!, wasmUrl: wasmUrl! }
      transformClientRef.current = acquireTransformClient(getCompilerWorkerUrl(assets, legacyUrl))
    }
    return transformClientRef.current.transform(files)
  }, [workerUrl, bindingUrl, wasmUrl, legacyUrl])

  const runLoad = useCallback(async (files: Record<string, string>, loadId: number) => {
    if (loadId !== loadIdRef.current) return

    try {
      const session = sessionRef.current
      if (!session) return
      if (transformCacheRef.current?.key !== transformKey) {
        transformClientRef.current?.release()
        transformClientRef.current = undefined
        transformCacheRef.current = { key: transformKey, files: new Map() }
      }
      const cache = transformCacheRef.current.files
      const resolveModuleForLoad = resolveModule
      const manifest = createIframeRouteManifest(files)

      await init
      if (loadId !== loadIdRef.current) return
      const localFiles = new Map(Object.keys(files).map(path => [normalizeProjectPath(path), getModuleKey(path)]))
      const filenames = new Map(Object.keys(files).map(path => [getModuleKey(path), path]))
      const queue = [...Object.values(manifest.routes)]
      const transformedSources: Record<string, string> = {}
      const visited = new Set<string>()
      while (queue.length) {
        const moduleKey = queue.shift()!
        if (visited.has(moduleKey)) continue
        visited.add(moduleKey)
        const filename = filenames.get(moduleKey)!
        const source = files[filename]
        if (filename.endsWith('.css') || filename.endsWith('.json')) {
          transformedSources[filename] = source
          continue
        }
        if (!sourceExtensions.some(extension => filename.endsWith(extension))) {
          throw new Error(`Cannot import ${filename} as JavaScript. Use with { type: "text" } to import its contents.`)
        }
        let cached = cache.get(filename)
        if (cached?.source !== source) {
          const output = transform ? await transformFiles({ [filename]: source }) : { [filename]: source }
          if (loadId !== loadIdRef.current) return
          cached = { source, code: output[filename] }
          cache.set(filename, cached)
        }
        transformedSources[filename] = cached.code
        for (const imported of parse(cached.code)[0]) {
          if (!imported.n || !isRelative(imported.n) || isTextImport(cached.code, imported)) continue
          queue.push(resolveRelativeModule(filename, imported.n, localFiles, false))
        }
      }
      for (const filename of cache.keys()) {
        if (!(filename in files)) cache.delete(filename)
      }
      const linked = await linkModules(transformedSources, resolveModuleForLoad, files)
      if (loadId !== loadIdRef.current) return

      setPreview({ error: undefined, status: 'loading' })
      await session.render(linked.files, linked.dependencies, manifest)
      if (loadId !== loadIdRef.current) return
      setPreview({ error: undefined, status: 'ready' })
      iframeRef.current?.dispatchEvent(new CustomEvent('devjar:render'))
    } catch (error) {
      if (loadId !== loadIdRef.current) return
      setPreview({ error, status: 'failed' })
    }
  }, [resolveModule, transform, transformFiles, transformKey])

  // Changing Tailwind also replaces the session and must retrigger the component load.
  const load = useCallback((files: Record<string, string>) => {
    const loadId = ++loadIdRef.current
    setPreview({ error: undefined, status: 'compiling' })
    const promise = loadQueueRef.current.enqueue(() => runLoad(files, loadId))
    lastLoadRef.current = { files, promise }
    return promise
  }, [runLoad, tailwind])

  const reset = useCallback((): Promise<void> => {
    if (pendingResetRef.current) return pendingResetRef.current
    const session = sessionRef.current
    if (!session) return Promise.resolve()
    const resetId = ++loadIdRef.current
    loadQueueRef.current.clear()
    loadQueueRef.current = createLoadQueue()
    transformClientRef.current?.release()
    transformClientRef.current = undefined
    transformCacheRef.current = undefined
    setPreview({ error: undefined, status: 'loading' })
    const pending = session.reset().then(async () => {
      if (sessionRef.current !== session) return
      const latest = lastLoadRef.current
      if (!latest) setPreview({ error: undefined, status: 'idle' })
      else if (loadIdRef.current === resetId) await load(latest.files)
      else await latest.promise
    }).catch(error => {
      if (sessionRef.current === session) setPreview({ error, status: 'failed' })
    }).finally(() => {
      if (pendingResetRef.current === pending) pendingResetRef.current = undefined
    })
    pendingResetRef.current = pending
    return pending
  }, [load])

  return { ref: iframeRef, error, status, load, reset }
}

export {
  createModule,
  createIframeRouteManifest,
  createRenderer,
  linkModules,
  replaceImports,
  useLiveCode,
}
