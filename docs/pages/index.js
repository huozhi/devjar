import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import CodeEditor from '../components/editor'
import { useDynamicModule } from 'devjar/react'

const defaultText = `
export const add = (a, b) => a + b

export default function MyComponent() {
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

  const [code, setCode] = useState({
    'index.js': defaultText,
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
    load(code).then(renderModule)
  }, [code])

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
        .sh__class {
          color: #2d5e9d;
        }
        .sh__identifier {
          color: #354150;
        }
        .sh__sign {
          color: #8996a3;
        }
        .sh__string {
          color: #00a99a;
        }
        .sh__keyword {
          color: #f47067;
        }
        .sh__comment {
          color: #a19595;
        }
        .sh__jsxliterals {
          color: #6266d1;
        }
        .sh__line::before {
          content: attr(data-line-number);
          width: 24px;
          display: inline-block;
          margin-right: 20px;
          text-align: right;
          color: #a4a4a4;
        }
        .editor {
          position: relative;
          min-height: 100px;
          display: flex;
        }
        .absolute-full {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
        }
        .pad {
          overflow-wrap: break-word;
          display: inline-block;
          padding: 16px 12px;
          background-color: #f6f6f6;
          border: none;
          border-radius: 12px;
          font-family: Consolas, Monaco, monospace;
          font-size: 16px;
          line-height: 1.25em;
          caret-color: #333;
        }
        .block {
          display: block;
          position: relative;
        }
        .pre {
          margin: 0;
          flex: 1 0;
          white-space: pre-wrap;
        }
        .pre code {
          width: 100%;
          min-height: 100px;
        }
        .code-input {
          resize: none;
          display: block;
          width: 100%;
          background-color: transparent;
          color: transparent;
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
        {Object.keys(code).map((filename) => (
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
            const newFilename = Object.keys(code).length + '.js'
            setCode({
              ...code,
              [newFilename]: `export default function () {}`,
            })
            setActiveFile(newFilename)
          }}
        >
          +
        </button>
        <CodeEditor
          key={activeFile}
          content={code[activeFile]}
          onChange={(updated) => {
            setCode({
              ...code,
              [activeFile]: updated,
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
