import { useEffect, useCallback, useState, useId, useRef } from 'react'
import { createModule } from './module.mjs'
import { transform } from 'sucrase'
import { init, parse } from 'es-module-lexer'

let esModuleLexerInit

const isRelative = s => s.startsWith('./')

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
    let isCss = false
    code += source.slice(lastIndex, ss) // content from last import to beginning of this line 
    

    // handle imports
    if (n.endsWith('.css')) {
      isCss = true
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
      code += `import sheet${cssImportIndex} from "${cssPath}" assert { type: "css" };\n`
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

function createRenderer(createModule_, getModuleUrl) {
  let reactRoot

  async function render(files) {
    const mod = await createModule_(files, { getModuleUrl })
    const React_ = await self.importShim('react')
    const ReactDOM_ = await self.importShim('react-dom')

    const _jsx = React_.createElement
    const root = document.getElementById('root')
    class ErrorBoundary extends React_.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      componentDidCatch(error) {
        this.setState({ error })
      }
      render() {
        if (this.state.error) {
          return _jsx('div', null, this.state.error.message)
        }
        return this.props.children
      }
    }

    const isReact18 = !!ReactDOM_.createRoot
    if (isReact18 && !reactRoot) {
      reactRoot = ReactDOM_.createRoot(root)
    }
    const Component = mod.default
    const element = _jsx(ErrorBoundary, null, _jsx(Component))
    if (isReact18) {
      reactRoot.render(element)
    } else {
      ReactDOM_.render(element, root)
    }
  }

  return render
}

function createMainScript({ uid }) {
  const code = (
`'use strict';
const _createModule = ${createModule.toString()};
const _createRenderer = ${createRenderer.toString()};

const getModuleUrl = (m) => window.parent.__devjar__[globalThis.uid].getModuleUrl(m)

globalThis.uid = ${JSON.stringify(uid)};
globalThis.__render__ = _createRenderer(_createModule, getModuleUrl);
`)
  return code
}

function createEsShimOptionsScript() {
  return `window.esmsInitOptions = {
    polyfillEnable: ['css-modules', 'json-modules'],
    onerror: error => console.log(error),
  }`
}

function useScript() {
  return useRef(typeof window !== 'undefined' ? document.createElement('script') : null)
}

function setScript(scriptRef, scriptContent, { type } = {}) {
  const script = scriptRef.current
  if (type) script.type = type
  
  script.src = `data:text/javascript;utf-8,${encodeURIComponent(scriptContent)}`
  return script
}

function useLiveCode({ getModuleUrl }) {
  const iframeRef = useRef()
  const [error, setError] = useState()
  const rerender = useState({})[1]
  const appScriptRef = useScript()
  const esShimOptionsScript = useScript()
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
    const div = document.createElement('div')
    div.id = 'root'
    
    const appScriptContent = createMainScript({ uid })
    const scriptOptionsContent = createEsShimOptionsScript()
    
    const esmShimOptionsScript = setScript(esShimOptionsScript, scriptOptionsContent)
    const appScript = setScript(appScriptRef, appScriptContent, { type: 'module' })
    // const script = scriptRef.current
    // script.type = 'module'
    // script.id = 'main'
    // script.src = `data:text/javascript;utf-8,${encodeURIComponent(scriptContent)}`

    doc.body.appendChild(div)
    doc.body.appendChild(esmShimOptionsScript)
    doc.body.appendChild(appScript)
    
    return () => {
      if (!iframe || !iframe.contentDocument) return
      doc.body.removeChild(div)
      doc.body.removeChild(esmShimOptionsScript)
      doc.body.removeChild(appScript)
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
          const key = isRelative(filename) ? ('@' + filename.slice(2)) : filename
          if (filename.endsWith('.css')) {
            res[key] = files[filename]
          } else {
            res[key] = transformCode(files[filename], getModuleUrl, overrideExternals)
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
            }
          }
        }
        setError()
      } catch (e) {
        console.error(e)
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
