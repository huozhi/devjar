import { useEffect, useCallback, useState, useId, useRef } from 'react'
import { createModule } from './module'
import { init, parse } from 'es-module-lexer'

let esModuleLexerInit
const isRelative = s => s.startsWith('./')
const removeExtension = (str: string) => str.replace(/\.[^/.]+$/, '')
const localImportPrefix = '__DEVJAR_LOCAL_IMPORT__'

function createLocalImportPlaceholder(moduleKey: string) {
  return `${localImportPrefix}${encodeURIComponent(moduleKey)}__`
}

function transformWorkerMain() {
  let oxc

  function getLang(filename) {
    if (/\.[cm]?tsx?$/.test(filename)) return 'tsx'
    return 'jsx'
  }

  function getTransformErrorMessage(errors) {
    if (!errors?.length) return ''

    const error = errors.find(error => error.severity === 'Error')
    if (!error) return ''

    return error.codeframe || error.message || 'devjar: transform failed'
  }

  self.onmessage = async ({ data }) => {
    const { id, moduleUrl, files } = data
    try {
      if (!oxc) {
        oxc = await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleUrl)
      }

      const transformed = {}
      for (const [filename, source] of Object.entries(files)) {
        const output = oxc.transformSync(filename, source, {
          lang: getLang(filename),
          sourceType: 'module',
          target: 'es2022',
          decorator: {
            legacy: true,
          },
          jsx: {
            runtime: 'automatic',
            development: true,
            refresh: true,
          },
          sourcemap: false,
        })

        const errorMessage = getTransformErrorMessage(output.errors)
        if (errorMessage) throw new Error(errorMessage)

        transformed[filename] = output.code
      }
      self.postMessage({ id, transformed })
    } catch (error) {
      self.postMessage({
        id,
        error: {
          message: error?.message || String(error),
          stack: error?.stack,
        },
      })
    }
  }
}

function createTransformWorker() {
  const source = `(${transformWorkerMain.toString()})()`
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  const worker = new Worker(url, { type: 'module', name: 'devjar-transform' })
  URL.revokeObjectURL(url)
  return worker
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

function replaceImports(source, filename, moduleKey, getModuleUrl, localModules) {
  let code = ''
  let lastIndex = 0
  let hasReactImports = false
  const [imports] = parse(source)
  const cssImports = []
  const dependencies = []
  
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
        : getModuleUrl(n)
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
    code = `import React from ${JSON.stringify(getModuleUrl('react'))};\n${code}`
  }

  code = `const $RefreshReg$ = (type, id) => globalThis.__devjarRefreshRuntime.register(type, ${JSON.stringify(moduleKey + ' ')} + id);\n` +
    `const $RefreshSig$ = globalThis.__devjarRefreshRuntime.createSignatureFunctionForTransform;\n` +
    code

  return { code, dependencies }
}

// createRenderer is going to be stringified and executed in the iframe
function createRenderer(createModule_, getModuleUrl) {
  let reactRoot
  let ErrorBoundary
  let errorBoundary
  let revision = 0
  const moduleRuntime: any = {}

  async function render(files: Record<string, string>, dependencies: Record<string, string[]>) {
    const result = await createModule_(files, { getModuleUrl, dependencies, runtime: moduleRuntime })
    const ReactMod: typeof import('react') = await import(/* webpackIgnore: true */ getModuleUrl('react'))
    const ReactDOMMod: typeof import('react-dom/client') = await import(/* webpackIgnore: true */ getModuleUrl('react-dom/client'))

    const _jsx = ReactMod.createElement
    const root = document.getElementById('__reactRoot')

    if (!ErrorBoundary) {
      ErrorBoundary = class extends ReactMod.Component<any, { error: unknown }> {
        constructor(props: any) {
          super(props)
          this.state = { error: null }
        }
        static getDerivedStateFromError(error) {
          return { error }
        }
        reset() {
          if (this.state.error) this.setState({ error: null })
        }
        componentDidUpdate(previousProps) {
          if (previousProps.revision !== this.props.revision && this.state.error) {
            this.setState({ error: null })
          }
        }
        render() {
          if (this.state.error) {
            return _jsx('div', null, (this.state.error as any)?.message)
          }
          return this.props.children
        }
      }
    }

    if (!reactRoot) {
      reactRoot = ReactDOMMod.createRoot(root)
      revision++
      reactRoot.render(_jsx(ErrorBoundary, { revision, ref: value => errorBoundary = value }, _jsx(result.module.default)))
      moduleRuntime.hasRendered = true
      return
    }

    if (result.changed) {
      errorBoundary?.reset()
      const refreshRuntime = moduleRuntime.refreshRuntime
      const refreshUpdate = refreshRuntime.performReactRefresh()
      const mountedRootCount = typeof refreshRuntime._getMountedRootCount === 'function'
        ? refreshRuntime._getMountedRootCount()
        : 0

      if (!refreshUpdate || mountedRootCount === 0) {
        revision++
        reactRoot.render(_jsx(ErrorBoundary, { revision, ref: value => errorBoundary = value }, _jsx(result.module.default)))
      }
    }
  }

  return render
}

function createMainScript({ uid }) {
  const code = (`\
'use strict';
const _createModule = ${createModule.toString()};
const _createRenderer = ${createRenderer.toString()};

const getModuleUrl = (m) => window.parent.__devjar__[globalThis.uid].getModuleUrl(m)

globalThis.uid = ${JSON.stringify(uid)};
globalThis.__render__ = _createRenderer(_createModule, getModuleUrl);
`)
  return code
}

function useScript() {
  return useRef(typeof window !== 'undefined' ? document.createElement('script') : null)
}

function createScript(
  scriptRef: React.RefObject<HTMLScriptElement>,
  { content, src, type }: {
    content?: string
    src?: string
    type?: string
  } = {}
) {
  const script = scriptRef.current
  if (type) script.type = type
  
  if (content) {
    script.src = `data:text/javascript;utf-8,${encodeURIComponent(content)}`
  }
  if (src) {
    script.src = src
  }
  return script
}

function useLiveCode({ getModuleUrl }: { getModuleUrl?: (name: string) => string }) {
  const iframeRef = useRef(null)
  const [error, setError] = useState()
  const rerender = useState({})[1]
  const appScriptRef = useScript()
  const tailwindcssScriptRef = useScript()
  const transformWorkerRef = useRef<Worker | undefined>(undefined)
  const transformCacheRef = useRef(new Map<string, { source: string, code: string }>())
  const transformRequestsRef = useRef(new Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>())
  const transformRequestIdRef = useRef(0)
  const loadIdRef = useRef(0)
  const uid = useId()

  // Let getModuleUrl executed on parent window side since it might involve
  // variables that iframe cannot access.
  useEffect(() => {
    if (!globalThis.__devjar__) {
      globalThis.__devjar__ = {};
    }
    globalThis.__devjar__[uid] = {
      getModuleUrl,
    }

    return () => {
      if (globalThis.__devjar__) {
        delete globalThis.__devjar__[uid]
      }
    }
  }, [getModuleUrl, uid])

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
    
    const appScript = createScript(appScriptRef, { content: appScriptContent, type: 'module' })
    const tailwindScript = createScript(tailwindcssScriptRef, { src: 'https://unpkg.com/@tailwindcss/browser@4' })

    body.appendChild(div)
    body.appendChild(appScript)
    body.appendChild(tailwindScript)
    
    return () => {
      if (!iframe || !iframe.contentDocument) return
      body.removeChild(div)
      body.removeChild(appScript)
      body.removeChild(tailwindScript)
    }
  }, [])

  const transformFiles = useCallback((files: Record<string, string>) => {
    if (!getModuleUrl) {
      return Promise.reject(new Error('devjar: getModuleUrl is required for the browser transformer'))
    }

    if (!transformWorkerRef.current) {
      const worker = createTransformWorker()
      worker.onmessage = ({ data }) => {
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
        moduleUrl: getModuleUrl('oxc-transform'),
      })
    })
  }, [getModuleUrl])

  const load = useCallback(async (files: Record<string, string>) => {
    const loadId = ++loadIdRef.current
    if (!esModuleLexerInit) {
      await init
      esModuleLexerInit = true
    }

    if (files) {
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
          transformCacheRef.current.set(filename, { source: files[filename], code: code as string })
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
        const dependencies = {}
        const transformedFiles = Object.keys(files).reduce((res, filename) => {
          // 1. Remove ./
          // 2. For non css files, remove extension
          // e.g. './styles.css' -> '@styles.css'
          // e.g. './foo.js' -> '@foo'
          const moduleKey = getModuleKey(filename)
          
          if (filename.endsWith('.css')) {
            res[moduleKey] = files[filename]
            dependencies[moduleKey] = []
          } else {
            // JS or TS files
            const transformed = replaceImports(
              transformCacheRef.current.get(filename).code,
              filename,
              moduleKey,
              getModuleUrl,
              localModules
            )
            res[moduleKey] = transformed.code
            dependencies[moduleKey] = transformed.dependencies
          }
          return res
        }, {})

        const iframe = iframeRef.current
        const script = appScriptRef.current
        if (iframe) {
          const render = iframe.contentWindow.__render__
          if (render) {
            await render(transformedFiles, dependencies)
          } else {
            // if render is not loaded yet, wait until it's loaded
            script.onload = () => {
              iframe.contentWindow.__render__(transformedFiles, dependencies)
                .catch((err) => {
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
  }, [getModuleUrl, transformFiles])

  return { ref: iframeRef, error, load }
}

export { 
  createModule,
  useLiveCode,
}
