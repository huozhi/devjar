import { useEffect, useCallback, useState, useRef } from 'react'
import { createModule } from './index.mjs'
import { transform } from 'sucrase'
import { init, parse } from 'es-module-lexer'

let esModuleLexerInit

const isRelative = s => s.startsWith('./')

function transformCode(_code, getModulePath, externals) {
  const code = transform(_code, {
    transforms: ['jsx', 'typescript'],
  }).code

  return replaceImports(code, getModulePath, externals)
}

function replaceImports(_code, getModulePath, externals) {
  const [imports] = parse(_code)
  let code = ''
  let lastIndex = 0
  imports.forEach(({ ss, s, e, se, n }) => {
    code += _code.slice(lastIndex, ss)
    code += _code.substring(ss, s)
    code += isRelative(n)
        ? ('@' + n.slice(2))
        : externals.has(n) ? n : getModulePath(n)
    code += _code.substring(e, se)
    lastIndex = se
  })
  code += _code.substring(lastIndex)
  return code
}

function createRenderer(_React0, _ReactDOM0, _createModule, _getModulePath) {
  let reactRoot

  async function render(files) {
    const mod = await _createModule(files, { getModulePath: _getModulePath })
    const _React = await self.importShim('react')
    const _ReactDOM = await self.importShim('react-dom')

    const _jsx = _React.createElement
    const root = document.getElementById('root')
    class ErrorBoundary extends _React.Component {
      state = {
        error: null,
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

    const isReact18 = !!_ReactDOM.createRoot
    if (isReact18 && !reactRoot) {
      reactRoot = _ReactDOM.createRoot(root)
    }
    const Component = mod.default
    const element = _jsx(ErrorBoundary, null, _jsx(Component))
    if (isReact18) {
      reactRoot.render(element)
    } else {
      _ReactDOM.render(element, root)
    }
  }

  return render
}

function createMainScript({ getModulePath }) {
  const code = (
`'use strict';
const createModule = ${createModule.toString()};
const createRenderer = ${createRenderer.toString()};
const getModulePath = ${getModulePath.toString()};

globalThis.__render__ = createRenderer(0, 0, createModule, getModulePath);
`)
  return code
}


export function useLiveCode({ getModulePath }) {
  const iframeRef = useRef()
  const [error, setError] = useState()
  const rerender = useState({})[1]
  const scriptRef = useRef(typeof window !== 'undefined' ? document.createElement('script') : null)

  useEffect(() => {
    const iframe = iframeRef.current
    const doc = iframe && iframe.contentDocument

    if (iframe) {
      const doc = iframe.contentDocument
      const div = document.createElement('div')
      const script = scriptRef.current
      const scriptContent = createMainScript({ getModulePath })

      div.id = 'root'
      script.type = 'module'
      script.id = 'main'
      script.src = `data:text/javascript;utf-8,${encodeURIComponent(scriptContent)}`

      doc.body.appendChild(div)
      doc.body.appendChild(script)
    }
    return () => {
      if (iframe) {
        doc.body.removeChild(doc.getElementById('root'))
        doc.body.removeChild(doc.getElementById('main'))
      }
    }
  }, [])

  const load = useCallback(async (files) => {
    if (!esModuleLexerInit) {
      await init
      esModuleLexerInit = true
    }

    if (files) {
      const overrideExternals =
        new Set(Object.keys(files).filter(name => !isRelative(name) && name !== 'index.mjs'))

      // Always share react as externals
      overrideExternals.add('react')
      overrideExternals.add('react-dom')

      try {
        const transformedFiles = Object.keys(files).reduce((res, filename) => {
          const key = isRelative(filename) ? ('@' + filename.slice(2)) : filename
          res[key] = transformCode(files[filename], getModulePath, overrideExternals)
          return res
        }, {})

        const iframe = iframeRef.current
        const script = scriptRef.current
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
        setError(e)
      }
    }
    rerender({})
  }, [])

  return { ref: iframeRef, error, load }
}
