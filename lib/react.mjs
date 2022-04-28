import { useEffect, useCallback, useState, useRef } from 'react'
import { createModule } from './index.mjs'

function createRenderer(_React, _ReactDOM, _createModule) {
  const _jsx = _React.createElement
  let reactRoot
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

  async function render(files) {
    const root = document.getElementById('root')
    if (!reactRoot) {
      reactRoot = _ReactDOM.createRoot(root)
    }
    const mod = await _createModule(files)
    const Component = mod.default
    const element = _jsx(ErrorBoundary, null, _jsx(Component))
    reactRoot.render(element)
  }

  return render
}

const renderModuleCode = `
import React from 'https://esm.sh/react'
import ReactDOM from 'https://esm.sh/react-dom'

const createModule = ${createModule.toString()};
const createRenderer = ${createRenderer.toString()};
globalThis.__render__ = createRenderer(React, ReactDOM, createModule);
`

function createMainScript() {
  return renderModuleCode
}

export function useLiveCode() {
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
