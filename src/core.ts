import { useEffect, useCallback, useState, useId, useMemo, useRef } from 'react'
import { createModule } from './module'
import type { ModuleRuntime } from './module'
import { init, parse } from 'es-module-lexer'
import { CDN_HOST, createEsmShResolver } from './cdn'
import { routeFromPagePath, sourceExtensions } from './project'

type ResolveModule = (specifier: string) => string
export type IframeRouteManifest = {
  routes: Record<string, string>
  notFound: string | undefined
}
type RenderFunction = (
  files: Record<string, string>,
  dependencies: Record<string, string[]>,
  manifest: IframeRouteManifest,
) => Promise<void>

declare global {
  var __jar__: Record<string, { resolveModule?: ResolveModule }> | undefined
  interface Window {
    __render__?: RenderFunction
  }
}

type TransformWorkerResponse = {
  id: number
  transformed: Record<string, string>
  error?: never
} | {
  id: number
  transformed?: never
  error: { message: string, stack?: string }
}
type TransformAssetManifest = {
  worker: string
  binding: string
  wasm: string
  wasiWorker: string
}

let esModuleLexerInit = false
const isRelative = (specifier: string) => specifier.startsWith('./') || specifier.startsWith('../')
const localImportPrefix = '__DEVJAR_LOCAL_IMPORT__'
const tailwindSrc = 'https://unpkg.com/@tailwindcss/browser@4'
const localExtensions = [...sourceExtensions, '.css']
let transformAssetManifestPromise: Promise<TransformAssetManifest> | undefined

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

function isTransformAssetManifest(value: unknown): value is TransformAssetManifest {
  if (typeof value !== 'object' || value === null) return false
  const manifest = value as Record<string, unknown>
  return ['worker', 'binding', 'wasm', 'wasiWorker']
    .every(name => typeof manifest[name] === 'string')
}

async function loadTransformAssetManifest() {
  if (!transformAssetManifestPromise) {
    transformAssetManifestPromise = (async () => {
      const url = new URL('./transform-assets.json', import.meta.url)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`devjar: Failed to load transform assets: ${response.status} ${response.statusText}`)
      }
      const manifest: unknown = await response.json()
      if (!isTransformAssetManifest(manifest)) {
        throw new Error('devjar: Invalid transform asset manifest')
      }
      return manifest
    })()
  }
  return transformAssetManifestPromise
}

async function createTransformWorker(transformWorkerUrl?: string | URL) {
  const manifestUrl = new URL('./transform-assets.json', import.meta.url)
  const assets = await loadTransformAssetManifest()
  const workerUrl = new URL(
    transformWorkerUrl ?? new URL(assets.worker, manifestUrl),
    globalThis.location.href,
  )
  workerUrl.searchParams.set(
    'binding',
    new URL(assets.binding, manifestUrl).href,
  )
  workerUrl.searchParams.set(
    'wasm',
    new URL(assets.wasm, manifestUrl).href,
  )
  workerUrl.searchParams.set(
    'wasiWorker',
    new URL(assets.wasiWorker, manifestUrl).href,
  )

  return new Worker(workerUrl, {
    type: 'module',
    name: 'devjar-transform',
  })
}

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
) {
  const requestedPath = resolveRelativePath(importer, imported)
  const candidates = /\.[^/]+$/.test(requestedPath)
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
  imports.forEach(({ s, e, ss, se, n }) => {
    if (!n) return
    code += source.slice(lastIndex, ss) // content from last import to beginning of this line

    const localModuleKey = isRelative(n)
      ? resolveRelativeModule(filename, n, localFiles)
      : undefined

    // handle imports
    if (localModuleKey && localModuleKey.endsWith('.css')) {
      // Map './styles.css' -> '@styles.css', and collect it
      cssImports.push(localModuleKey)
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
) {
  if (!esModuleLexerInit) {
    await init
    esModuleLexerInit = true
  }

  const localFiles = new Map(
    Object.keys(files).map(filename => [normalizeProjectPath(filename), getModuleKey(filename)]),
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

    const linked = replaceImports(
      source,
      filename,
      moduleKey,
      resolveModule,
      localFiles,
    )
    linkedFiles[moduleKey] = linked.code
    dependencies[moduleKey] = linked.dependencies
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
  ]> | undefined
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
      rendererModules = Promise.all([
        import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ reactModuleUrl),
        import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ reactDomModuleUrl),
      ])
    }
    const [ReactMod, ReactDOMMod] = await rendererModules
    if (requestId !== renderRequestId) return

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

    if (!reactRoot) {
      reactRoot = ReactDOMMod.createRoot(root)
      revision++
      reactRoot.render(_jsx(
        ErrorBoundary,
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
        ErrorBoundary,
        { revision, ref: setErrorBoundaryRef },
        _jsx(App)
      ))
      return
    }

    if (result?.changed) {
      errorBoundary?.reset()
      const refreshRuntime = moduleRuntime.refreshRuntime
      if (!refreshRuntime) throw new Error('devjar: refresh runtime was not initialized')
      const refreshUpdate = refreshRuntime.performReactRefresh()
      const mountedRootCount = typeof refreshRuntime._getMountedRootCount === 'function'
        ? refreshRuntime._getMountedRootCount()
        : 0

      if (!refreshUpdate || mountedRootCount === 0) {
        revision++
        reactRoot.render(_jsx(
          ErrorBoundary,
          { revision, ref: setErrorBoundaryRef },
          _jsx(App)
        ))
      }
    }
  }

  function render(
    files: Record<string, string>,
    dependencies: Record<string, string[]>,
    manifest: IframeRouteManifest,
  ) {
    const requestId = ++renderRequestId
    currentFiles = files
    currentDependencies = dependencies
    currentManifest = manifest
    const pendingRender = renderQueue.then(() => {
      if (requestId !== renderRequestId) return
      return renderCurrent(files, dependencies, manifest, requestId)
    })
    renderQueue = pendingRender.catch(() => {})
    return pendingRender
  }

  document.addEventListener('click', (event) => {
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
      void render(currentFiles, currentDependencies, currentManifest)
    }
  })

  return render
}

function createMainScript({ uid }: { uid: string }) {
  const code = (`\
'use strict';
const _createModule = ${createModule.toString()};
const _createRenderer = ${createRenderer.toString()};

const resolveModule = (specifier) => window.parent.__jar__[globalThis.uid].resolveModule(specifier)

globalThis.uid = ${JSON.stringify(uid)};
globalThis.__render__ = _createRenderer(_createModule, resolveModule);
`)
  return code
}

function useScript() {
  return useRef<HTMLScriptElement | null>(null)
}

function createScript(
  scriptRef: React.RefObject<HTMLScriptElement | null>,
  { content, src, type }: {
    content?: string
    src?: string
    type?: string
  } = {}
) {
  const script = scriptRef.current || document.createElement('script')
  scriptRef.current = script
  if (type) script.type = type
  
  if (content) {
    script.src = `data:text/javascript;utf-8,${encodeURIComponent(content)}`
  }
  if (src) {
    script.src = src
  }
  return script
}

function useLiveCode({
  resolveModule: customResolveModule,
  dependencies,
  transform = true,
  tailwind = true,
  transformWorkerUrl,
}: {
  resolveModule?: (specifier: string) => string
  dependencies?: Record<string, string>
  transform?: boolean
  tailwind?: boolean
  transformWorkerUrl?: string | URL
}) {
  const resolveModule = useMemo(
    () => customResolveModule || createEsmShResolver(dependencies || {}, CDN_HOST),
    [customResolveModule, dependencies]
  )
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [error, setError] = useState<unknown>()
  const rerender = useState({})[1]
  const appScriptRef = useScript()
  const tailwindcssScriptRef = useScript()
  const tailwindReadyRef = useRef<Promise<void>>(Promise.resolve())
  const transformWorkerRef = useRef<Worker | undefined>(undefined)
  const transformWorkerPromiseRef = useRef<Promise<Worker> | undefined>(undefined)
  const transformCacheRef = useRef(new Map<string, { source: string, code: string }>())
  const transformRequestsRef = useRef(new Map<number, {
    resolve: (value: Record<string, string>) => void
    reject: (error: Error) => void
  }>())
  const transformRequestIdRef = useRef(0)
  const loadIdRef = useRef(0)
  const uid = useId()

  // Let resolveModule execute on parent window side since it might involve
  // variables that iframe cannot access.
  useEffect(() => {
    if (!globalThis.__jar__) {
      globalThis.__jar__ = {};
    }
    globalThis.__jar__[uid] = {
      resolveModule,
    }

    return () => {
      if (globalThis.__jar__) {
        delete globalThis.__jar__[uid]
      }
    }
  }, [resolveModule, uid])

  useEffect(() => {
    return () => {
      loadIdRef.current++
      const worker = transformWorkerRef.current
      const workerPromise = transformWorkerPromiseRef.current
      transformWorkerPromiseRef.current = undefined
      transformWorkerRef.current?.terminate()
      transformWorkerRef.current = undefined
      if (!worker) void workerPromise?.then(pendingWorker => pendingWorker.terminate(), () => {})
      for (const { reject } of transformRequestsRef.current.values()) {
        reject(new Error('devjar: transform worker was terminated'))
      }
      transformRequestsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentDocument) return
    
    const doc = iframe.contentDocument
    const body = doc.body
    const div = document.createElement('div')
    div.id = '__reactRoot'
    
    const appScriptContent = createMainScript({ uid })
    
    const appScript = createScript(appScriptRef, { content: appScriptContent })
    const tailwindScript = tailwind
      ? createScript(tailwindcssScriptRef, { src: tailwindSrc })
      : null

    let resolveTailwind: (() => void) | undefined
    tailwindReadyRef.current = tailwindScript
      ? new Promise<void>((resolve) => {
          const ready = () => resolve()
          resolveTailwind = ready
          tailwindScript.addEventListener('load', ready, { once: true })
          tailwindScript.addEventListener('error', ready, { once: true })
        })
      : Promise.resolve()

    body.appendChild(div)
    if (tailwindScript) body.appendChild(tailwindScript)
    body.appendChild(appScript)
    
    return () => {
      if (!iframe || !iframe.contentDocument) return
      body.removeChild(div)
      body.removeChild(appScript)
      if (tailwindScript) body.removeChild(tailwindScript)
      resolveTailwind?.()
    }
  }, [])

  const transformFiles = useCallback(async (files: Record<string, string>) => {
    let workerPromise = transformWorkerPromiseRef.current
    if (!workerPromise) {
      workerPromise = createTransformWorker(transformWorkerUrl)
      transformWorkerPromiseRef.current = workerPromise
    }

    let worker: Worker
    try {
      worker = await workerPromise
    } catch (error) {
      if (transformWorkerPromiseRef.current === workerPromise) {
        transformWorkerPromiseRef.current = undefined
      }
      throw error
    }

    if (transformWorkerPromiseRef.current !== workerPromise) {
      worker.terminate()
      throw new Error('devjar: transform worker was terminated')
    }

    if (!transformWorkerRef.current) {
      worker.onmessage = ({ data }: MessageEvent<TransformWorkerResponse>) => {
        const request = transformRequestsRef.current.get(data.id)
        if (!request) return
        transformRequestsRef.current.delete(data.id)
        if (data.error) {
          const error = new Error(data.error.message)
          if (data.error.stack) error.stack = data.error.stack
          request.reject(error)
        } else {
          request.resolve(data.transformed)
        }
      }
      worker.onerror = (event) => {
        const error = new Error(event.message || 'devjar: transform worker failed')
        for (const { reject } of transformRequestsRef.current.values()) reject(error)
        transformRequestsRef.current.clear()
      }
      transformWorkerRef.current = worker
    }

    const id = ++transformRequestIdRef.current
    return new Promise<Record<string, string>>((resolve, reject) => {
      transformRequestsRef.current.set(id, { resolve, reject })
      worker.postMessage({
        id,
        files,
      })
    })
  }, [resolveModule, transformWorkerUrl])

  const load = useCallback(async (files: Record<string, string>) => {
    const loadId = ++loadIdRef.current

    try {
      const resolveModuleForLoad = resolveModule
      const manifest = createIframeRouteManifest(files)

      const filesToTransform = Object.fromEntries(
        Object.entries(files).filter(([filename, source]) => {
          return !filename.endsWith('.css') && transformCacheRef.current.get(filename)?.source !== source
        })
      )
      const newTransforms = Object.keys(filesToTransform).length
        ? transform ? await transformFiles(filesToTransform) : filesToTransform
        : {}

      if (loadId !== loadIdRef.current) return
      for (const [filename, code] of Object.entries(newTransforms)) {
        transformCacheRef.current.set(filename, { source: files[filename], code })
      }
      for (const filename of transformCacheRef.current.keys()) {
        if (!(filename in files)) transformCacheRef.current.delete(filename)
      }

      const transformedSources: Record<string, string> = {}
      for (const filename of Object.keys(files)) {
        if (filename.endsWith('.css')) {
          transformedSources[filename] = files[filename]
        } else {
          const cachedTransform = transformCacheRef.current.get(filename)
          if (!cachedTransform) {
            throw new Error(`devjar: Missing transform for ${filename}`)
          }
          transformedSources[filename] = cachedTransform.code
        }
      }
      const linked = await linkModules(transformedSources, resolveModuleForLoad)
      if (loadId !== loadIdRef.current) return

      const iframe = iframeRef.current
      const script = appScriptRef.current
      if (iframe) {
        const contentWindow = iframe.contentWindow
        if (!contentWindow) throw new Error('devjar: iframe window is unavailable')
        const renderFiles = async () => {
          await tailwindReadyRef.current
          if (loadId !== loadIdRef.current) return
          const render = contentWindow.__render__
          if (!render) throw new Error('devjar: renderer was not initialized')
          await render(linked.files, linked.dependencies, manifest)
          if (loadId === loadIdRef.current) {
            iframe.dispatchEvent(new CustomEvent('devjar:render'))
          }
        }

        const render = contentWindow.__render__
        if (render) {
          await renderFiles()
        } else {
          // if render is not loaded yet, wait until it's loaded
          if (!script) throw new Error('devjar: application script was not initialized')
          script.onload = () => {
            renderFiles().catch((err) => {
              if (loadId === loadIdRef.current) setError(err)
            })
          }
        }
      }
      if (loadId === loadIdRef.current) setError(undefined)
    } catch (e) {
      if (loadId !== loadIdRef.current) return
      console.warn(e)
      setError(e)
    }
    rerender({})
  }, [resolveModule, transform, transformFiles])

  return { ref: iframeRef, error, load }
}

export { 
  createModule,
  createIframeRouteManifest,
  createRenderer,
  linkModules,
  replaceImports,
  useLiveCode,
}
