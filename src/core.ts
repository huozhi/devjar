import { useEffect, useCallback, useState, useId, useRef } from 'react'
import { createModule } from './module'
import type { ModuleRuntime } from './module'
import { init, parse } from 'es-module-lexer'

type ResolveModule = (specifier: string) => string
type RenderFunction = (
  files: Record<string, string>,
  dependencies: Record<string, string[]>
) => Promise<void>

declare global {
  var __devjar__: Record<string, { resolveModule?: ResolveModule }> | undefined
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

let esModuleLexerInit = false
const isRelative = (specifier: string) => specifier.startsWith('./')
const removeExtension = (str: string) => str.replace(/\.[^/.]+$/, '')
const localImportPrefix = '__DEVJAR_LOCAL_IMPORT__'
const defaultTailwindSrc = 'https://unpkg.com/@tailwindcss/browser@4'

function createLocalImportPlaceholder(moduleKey: string) {
  return `${localImportPrefix}${encodeURIComponent(moduleKey)}__`
}

function createTransformWorker() {
  return new Worker(new URL('./transform-worker.js', import.meta.url), {
    type: 'module',
    name: 'devjar-transform',
  })
}

function getModuleKey(filename: string) {
  const key = isRelative(filename) ? '@' + filename.slice(2) : filename
  return filename.endsWith('.css') ? key : removeExtension(key)
}

function resolveRelativeModule(importer: string, imported: string) {
  const importerPath = importer.startsWith('./') ? importer.slice(2) : importer
  const parts = importerPath.split('/')
  parts.pop()

  for (const part of imported.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  const path = parts.join('/')
  return imported.endsWith('.css') ? '@' + path : removeExtension('@' + path)
}

function replaceImports(
  source: string,
  filename: string,
  moduleKey: string,
  resolveModule: ResolveModule,
  localModules: ReadonlySet<string>
) {
  let code = ''
  let lastIndex = 0
  let hasReactImports = false
  const [imports] = parse(source)
  const cssImports: string[] = []
  const dependencies: string[] = []
  
  // start, end, statementStart, statementEnd, assertion, name
  imports.forEach(({ s, e, ss, se, a, n }) => {
    if (!n) return
    code += source.slice(lastIndex, ss) // content from last import to beginning of this line 

    const localModuleKey = isRelative(n)
      ? resolveRelativeModule(filename, n)
      : localModules.has(n) ? n : undefined

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

// createRenderer is going to be stringified and executed in the iframe
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
  let revision = 0
  const moduleRuntime: ModuleRuntime = {}
  const setErrorBoundaryRef = (value: ErrorBoundaryInstance | null) => {
    errorBoundary = value
  }

  async function render(files: Record<string, string>, dependencies: Record<string, string[]>) {
    const result = await createModule_(files, { resolveModule, dependencies, runtime: moduleRuntime })
    const ReactMod: typeof import('react') = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ resolveModule('react'))
    const ReactDOMMod: typeof import('react-dom/client') = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ resolveModule('react-dom/client'))

    const _jsx = ReactMod.createElement
    const root = document.getElementById('__reactRoot')
    if (!root) throw new Error('devjar: render root was not found')
    if (!isElementType(result.module.default)) {
      throw new Error('devjar: index must have a default React component export')
    }
    const App = result.module.default

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
      moduleRuntime.hasRendered = true
      return
    }

    if (result.changed) {
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

  return render
}

function createMainScript({ uid }: { uid: string }) {
  const code = (`\
'use strict';
const _createModule = ${createModule.toString()};
const _createRenderer = ${createRenderer.toString()};

const resolveModule = (specifier) => window.parent.__devjar__[globalThis.uid].resolveModule(specifier)

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
  resolveModule,
  tailwindSrc = defaultTailwindSrc,
}: {
  resolveModule?: (specifier: string) => string
  tailwindSrc?: string | false
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [error, setError] = useState<unknown>()
  const rerender = useState({})[1]
  const appScriptRef = useScript()
  const tailwindcssScriptRef = useScript()
  const transformWorkerRef = useRef<Worker | undefined>(undefined)
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
    if (!globalThis.__devjar__) {
      globalThis.__devjar__ = {};
    }
    globalThis.__devjar__[uid] = {
      resolveModule,
    }

    return () => {
      if (globalThis.__devjar__) {
        delete globalThis.__devjar__[uid]
      }
    }
  }, [resolveModule, uid])

  useEffect(() => {
    return () => {
      transformWorkerRef.current?.terminate()
      transformWorkerRef.current = undefined
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
    const tailwindScript = tailwindSrc
      ? createScript(tailwindcssScriptRef, { src: tailwindSrc })
      : null

    body.appendChild(div)
    body.appendChild(appScript)
    if (tailwindScript) body.appendChild(tailwindScript)
    
    return () => {
      if (!iframe || !iframe.contentDocument) return
      body.removeChild(div)
      body.removeChild(appScript)
      if (tailwindScript) body.removeChild(tailwindScript)
    }
  }, [])

  const transformFiles = useCallback((files: Record<string, string>) => {
    if (!resolveModule) {
      return Promise.reject(new Error('devjar: resolveModule is required for the browser transformer'))
    }

    if (!transformWorkerRef.current) {
      const worker = createTransformWorker()
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
    const worker = transformWorkerRef.current!
    return new Promise<Record<string, string>>((resolve, reject) => {
      transformRequestsRef.current.set(id, { resolve, reject })
      worker.postMessage({
        id,
        files,
        moduleUrl: resolveModule('oxc-transform'),
      })
    })
  }, [resolveModule])

  const load = useCallback(async (files: Record<string, string>) => {
    const loadId = ++loadIdRef.current
    if (!esModuleLexerInit) {
      await init
      esModuleLexerInit = true
    }

    if (files) {
      if (!resolveModule) {
        setError(new Error('devjar: resolveModule is required'))
        rerender({})
        return
      }
      const resolveModuleForLoad = resolveModule
      const localModules = new Set(Object.keys(files).map(getModuleKey))

      try {
        const filesToTransform = Object.fromEntries(
          Object.entries(files).filter(([filename, source]) => {
            return !filename.endsWith('.css') && transformCacheRef.current.get(filename)?.source !== source
          })
        )
        const newTransforms = Object.keys(filesToTransform).length
          ? await transformFiles(filesToTransform)
          : {}

        if (loadId !== loadIdRef.current) return
        for (const [filename, code] of Object.entries(newTransforms)) {
          transformCacheRef.current.set(filename, { source: files[filename], code })
        }
        for (const filename of transformCacheRef.current.keys()) {
          if (!(filename in files)) transformCacheRef.current.delete(filename)
        }

        /**
         * transformedFiles
         * {
         *  'index.js': '...',
         *  '@mod1': '...',
         *  '@mod2': '...',
         */
        const dependencies: Record<string, string[]> = {}
        const transformedFiles: Record<string, string> = {}
        for (const filename of Object.keys(files)) {
          // 1. Remove ./
          // 2. For non css files, remove extension
          // e.g. './styles.css' -> '@styles.css'
          // e.g. './foo.js' -> '@foo'
          const moduleKey = getModuleKey(filename)
          
          if (filename.endsWith('.css')) {
            transformedFiles[moduleKey] = files[filename]
            dependencies[moduleKey] = []
          } else {
            // JS or TS files
            const cachedTransform = transformCacheRef.current.get(filename)
            if (!cachedTransform) {
              throw new Error(`devjar: Missing transform for ${filename}`)
            }
            const transformed = replaceImports(
              cachedTransform.code,
              filename,
              moduleKey,
              resolveModuleForLoad,
              localModules
            )
            transformedFiles[moduleKey] = transformed.code
            dependencies[moduleKey] = transformed.dependencies
          }
        }

        const iframe = iframeRef.current
        const script = appScriptRef.current
        if (iframe) {
          const contentWindow = iframe.contentWindow
          if (!contentWindow) throw new Error('devjar: iframe window is unavailable')
          const renderFiles = async () => {
            const render = contentWindow.__render__
            if (!render) throw new Error('devjar: renderer was not initialized')
            await render(transformedFiles, dependencies)
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
                setError(err)
              })
            }
          }
        }
        setError(undefined)
      } catch (e) {
        console.warn(e)
        setError(e)
      }
    }
    rerender({})
  }, [resolveModule, transformFiles])

  return { ref: iframeRef, error, load }
}

export { 
  createModule,
  useLiveCode,
}
