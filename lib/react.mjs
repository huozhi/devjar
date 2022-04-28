import { useEffect, useCallback, useState, useRef } from 'react'

const createModule = `
import React from 'https://esm.sh/react'
import ReactDOM from 'https://esm.sh/react-dom'
import { transform } from 'https://esm.sh/sucrase'

async function createModule(files) {
  let currentImportMap
  let shim

  async function setupImportMap() {
    if (shim) return shim
    globalThis.esmsInitOptions = {
      shimMode: true,
      mapOverrides: true,
    }
    shim = import('https://esm.sh/es-module-shims')
    await shim
  }

  function updateImportMap(imports) {
    const script = document.createElement('script')
    script.type = 'importmap-shim'
    script.innerHTML = JSON.stringify({ imports })
    document.body.appendChild(script)
    if (currentImportMap) {
      currentImportMap.parentNode.removeChild(currentImportMap)
    }
    currentImportMap = script
  }


  function createInlinedModule(code) {
    return 'data:text/javascript;utf-8,' + encodeURIComponent(code)
  }

  function transformCode(code) {
    return transform(code, {
      transforms: ['jsx', 'typescript'],
    }).code
  }

  await setupImportMap()
  const imports = Object.fromEntries(
    Object.entries(files).map(([key, code]) => [
      key,
      createInlinedModule(transformCode(code)),
    ])
  )

  imports['react'] = 'https://esm.sh/react'
  updateImportMap(imports)
  return self.importShim('index.js')
}

const _jsx = React.createElement

class ErrorBoundary extends React.Component {
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

let reactRoot

async function __render__(files) {
  const root = document.getElementById('root')
  if (!reactRoot) {
    reactRoot = ReactDOM.createRoot(root)
  }
  const mod = await createModule(files)
  const Component = mod.default
  const element = _jsx(ErrorBoundary, null, _jsx(Component))
  reactRoot.render(element)
}

globalThis.__render__ = __render__
`

function createMainScript() {
  return createModule
}

export function useDynamicModule() {
  const iframeRef = useRef()
  const [error, setError] = useState()
  const rerender = useState({})[1]
  const scriptRef = useRef(
    typeof window !== 'undefined'
      ? document.createElement('script')
      : null
  )

  useEffect(() => {
    const iframe = iframeRef.current
    const doc = iframe && iframe.contentDocument

    if (iframe) {
      const doc = iframe.contentDocument
      const div = document.createElement('div')
      const script = scriptRef.current
      const scriptContent = createMainScript()

      div.id = 'root'
      script.type = 'module'
      script.id = 'main'
      script.src = 'data:text/javascript;utf-8,' + encodeURIComponent(scriptContent)

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
    if (files) {
      try {
        const iframe = iframeRef.current
        const script = scriptRef.current
        if (iframe) {
          const render = iframe.contentWindow.__render__
          if (render) {
            render(files)
          } else {
            // if render is not loaded yet, wait until it's loaded
            script.onload = () => {
              iframe.contentWindow.__render__(files)
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
