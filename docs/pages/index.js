import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Editor } from 'codice'
import { useDynamicModule } from 'devjar/react'

const entryText = `
export default function App() {
  return <div>Hello World</div>
}
`
// Share React
if (typeof window !== 'undefined') {
  window.React = React
}

class ErrorBoundary extends React.Component {
  state = {
    error: null,
  }
  componentDidCatch(error) {
    this.setState({ error })
  }
  render() {
    if (this.state.error) {
      return <div>{this.state.error.message}</div>
    }
    return this.props.children
  }
}

export default function Page() {
  const portalRef = useRef(null)
  const reactRootRef = useRef(null)

  const [files, setFiles] = useState({
    'index.js': entryText,
  })
  const [activeFile, setActiveFile] = useState('index.js')

  const { mod, error, load } = useDynamicModule()

  function renderModule() {
    if (!mod.current) return
    if (!mod.current.default) return
    if (!reactRootRef.current) {
      reactRootRef.current = ReactDOM.createRoot(portalRef.current)
    }
    const Component = mod.current.default
    reactRootRef.current.render(
      <ErrorBoundary>
        <Component />
      </ErrorBoundary>
    )
  }

  useEffect(() => {
    load(files).then(renderModule)
  }, [files])

  return (
    <div>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        html {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
            'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans',
            'Helvetica Neue', sans-serif;
        }
        body {
          max-width: 690px;
          margin: auto;
          padding: 40px 10px 40px;
        }
        :root {
          --sh-class: #2d5e9d;
          --sh-identifier: #354150;
          --sh-sign: #8996a3;
          --sh-string: #00a99a;
          --sh-keyword: #f47067;
          --sh-comment: #a19595;
          --sh-jsxliterals: #6266d1;
          --editor-text-color: transparent;
          --editor-background-color: transparent;
        }

        .sh__line::before {
          counter-increment: sh-line-number 1;
          content: counter(sh-line-number);
          width: 24px;
          display: inline-block;
          margin-right: 18px;
          margin-left: -42px;
          text-align: right;
          color: #a4a4a4;
        }
        .editor {
          position: relative;
          min-height: 100px;
          display: flex;
        }
        pre {
          width: 100%;
        }
        code, textarea {
          font-family: Consolas, Monaco, monospace;
          padding: 16px 12px;
          background-color: #f6f6f6;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          line-height: 1.25em;
          caret-color: #333;
        }
        textarea {
          padding-left: 54px;
        }
        code {
          counter-reset: sh-line-number;
          min-height: 100px;
          width: 100%;
          padding-left: 54px;
        }
        .executor {
          position: absolute;
          right: 8px;
          top: 8px;
          border: none;
          background: #333;
          border-radius: 4px;
          color: #fff;
        }
      `}</style>
      <div>
        <h3>Code</h3>
        {Object.keys(files).map((filename) => (
          <button
            key={filename}
            disabled={filename === activeFile}
            onClick={() => setActiveFile(filename)}
          >
            {filename}
          </button>
        ))}
        <button
          onClick={() => {
            const newFilename = 'mod' + Object.keys(files).length + '.js'
            setFiles({
              ...files,
              [newFilename]: `export default function () {}`,
            })
            setActiveFile(newFilename)
          }}
        >
          +
        </button>
        <Editor
          className='editor'
          value={files[activeFile]}
          onChange={(code) => {
            setFiles({
              ...files,
              [activeFile]: code,
            })
          }}
        />
      </div>

      <div>
        <h3>Preview</h3>
        <ErrorBoundary>
          <div className='pad block' ref={portalRef} />
        </ErrorBoundary>
      </div>

      <div>
        <h3>Error</h3>
        <div className='pad block'>{error ? error.message : null}</div>
      </div>
    </div>
  )
}
