import { useEffect, useCallback, useState, useId, useRef } from 'react'
import { createModule } from './module'
import { transform } from 'sucrase'
import { init, parse } from 'es-module-lexer'

let esModuleLexerInit
const isRelative = s => s.startsWith('./')
const removeExtension = (str: string) => str.replace(/\.[^/.]+$/, '')

function transformCode(_code, getModuleUrl, externals) {
  const code = transform(_code, {
    transforms: ['jsx', 'typescript'],
  }).code

  return replaceImports(code, getModuleUrl, externals)
}

function replaceImports(source, getModuleUrl, externals) {
  let code = ''
  let lastIndex = 0
  let hasReactImports = false
  const [imports] = parse(source)
  const cssImports = []
  let cssImportIndex = 0
  
  // start, end, statementStart, statementEnd, assertion, name
  imports.forEach(({ s, e, ss, se, a, n }) => {
    code += source.slice(lastIndex, ss) // content from last import to beginning of this line 
    

    // handle imports
    if (n.endsWith('.css')) {
      // Map './styles.css' -> '@styles.css', and collect it
      const cssPath = `${'@' + n.slice(2)}`
      cssImports.push(cssPath)
      
    } else {
      code += source.substring(ss, s)
      code += isRelative(n)
          ? ('@' + n.slice(2))
          : externals.has(n) ? n : getModuleUrl(n)
      code += source.substring(e, se)
    }
    
    lastIndex = se

    if (n === 'react') {
      const statement = source.slice(ss, se)
      if (statement.includes('React')) {
        hasReactImports = true
      }
    }

    cssImports.forEach(cssPath => {
      code += `\nimport sheet${cssImportIndex} from "${cssPath}" assert { type: "css" };\n`
      cssImportIndex++
    })
  })

  if (cssImports.length) {
    code += `const __customStyleSheets = [`
    for (let i = 0; i < cssImports.length; i++) {
      code += `sheet${i}`
      if (i < cssImports.length - 1) {
        code += `, `
      }
    }
    code += `];\n`
    code += `document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...__customStyleSheets];\n`
  }

  code += source.substring(lastIndex)

  if (!hasReactImports) {
    code = `import React from 'react';\n${code}`
  }

  return code
}

// createRenderer is going to be stringified and executed in the iframe
function createRenderer(createModule_, getModuleUrl) {
  let reactRoot

  async function render(files: Record<string, string>) {
    const mod = await createModule_(files, { getModuleUrl })
    const ReactMod: typeof import('react') = await self.importShim('react')
    const ReactDOMMod: typeof import('react-dom/client') = await self.importShim('react-dom/client')

    const _jsx = ReactMod.createElement
    const root = document.getElementById('__reactRoot')
    class ErrorBoundary extends ReactMod.Component<any, { error: unknown }> {
      constructor(props: any) {
        super(props)
        this.state = { error: null }
      }
      componentDidCatch(error) {
        this.setState({ error })
      }
      render() {
        if (this.state.error) {
          return _jsx('div', null, (this.state.error as any)?.message)
        }
        return this.props.children
      }
    }

    if (!reactRoot) {
      reactRoot = ReactDOMMod.createRoot(root)
    }
    const Component = mod.default
    const element = _jsx(ErrorBoundary, null, _jsx(Component))
    reactRoot.render(element)
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

function createEsShimOptionsScript() {
  return `\
window.esmsInitOptions = {
  polyfillEnable: ['css-modules', 'json-modules'],
  onerror: console.error,
}`
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
  const esShimOptionsScriptRef = useScript()
  const tailwindcssScriptRef = useScript()
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
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentDocument) return
    
    const doc = iframe.contentDocument
    const body = doc.body
    const div = document.createElement('div')
    div.id = '__reactRoot'
    
    const appScriptContent = createMainScript({ uid })
    const scriptOptionsContent = createEsShimOptionsScript()
    
    const esmShimOptionsScript = createScript(esShimOptionsScriptRef, { content: scriptOptionsContent })
    const appScript = createScript(appScriptRef, { content: appScriptContent, type: 'module' })
    const tailwindScript = createScript(tailwindcssScriptRef, { src: 'https://unpkg.com/@tailwindcss/browser@4' })

    body.appendChild(div)
    body.appendChild(esmShimOptionsScript)
    body.appendChild(appScript)
    body.appendChild(tailwindScript)
    
    return () => {
      if (!iframe || !iframe.contentDocument) return
      body.removeChild(div)
      body.removeChild(esmShimOptionsScript)
      body.removeChild(appScript)
      body.removeChild(tailwindScript)
    }
  }, [])

  const load = useCallback(async (files) => {
    if (!esModuleLexerInit) {
      await init
      esModuleLexerInit = true
    }

    if (files) {
      // { 'react', 'react-dom' }
      const overrideExternals =
        new Set(Object.keys(files).filter(name => !isRelative(name) && name !== 'index.js'))

      // Always share react as externals
      overrideExternals.add('react')
      overrideExternals.add('react-dom')

      try {
        /**
         * transformedFiles
         * {
         *  'index.js': '...',
         *  '@mod1': '...',
         *  '@mod2': '...',
         */
        const transformedFiles = Object.keys(files).reduce((res, filename) => {
          // 1. Remove ./
          // 2. For non css files, remove extension
          // e.g. './styles.css' -> '@styles.css'
          // e.g. './foo.js' -> '@foo'
          const moduleKey = isRelative(filename) ? ('@' + filename.slice(2)) : filename
          
          if (filename.endsWith('.css')) {
            res[moduleKey] = files[filename]
          } else {
            // JS or TS files
            const normalizedModuleKey = removeExtension(moduleKey)
            res[normalizedModuleKey] = transformCode(files[filename], getModuleUrl, overrideExternals)
          }
          return res
        }, {})

        const iframe = iframeRef.current
        const script = appScriptRef.current
        if (iframe) {
          const render = iframe.contentWindow.__render__
          if (render) {
            render(transformedFiles)
          } else {
            // if render is not loaded yet, wait until it's loaded
            script.onload = () => {
              iframe.contentWindow.__render__(transformedFiles)
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
  }, [])

  return { ref: iframeRef, error, load }
}

export { 
  createModule,
  useLiveCode,
}
