import React, { useRef } from 'react'
import ReactDOM from 'react-dom/client'
import CodeEditor from '../components/editor'

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

export default function Page() {
  const accessModuleRef = useRef(() => {})
  const portalRef = useRef(null)
  const reactRootRef = useRef(null)

  return (
    <div>
      <style jsx global>{`
      * {
        box-sizing: border-box;
      }
      html {
        font-family: "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","Roboto","Oxygen","Ubuntu","Cantarell","Fira Sans","Droid Sans","Helvetica Neue",sans-serif
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
        <CodeEditor
          defaultCode={defaultText}
          onAccessModule={(fn) => {
            accessModuleRef.current = fn
          }}
        >
          <button
            className='executor'
            onClick={async () => {
              const accessModule = accessModuleRef.current
              const { mod, error } = await accessModule()
              if (error) {
                console.error(error)
              } else {
                const Component = mod.default
                const element = <Component />
                if (!reactRootRef.current) {
                  reactRootRef.current = ReactDOM.createRoot(portalRef.current)
                }
                reactRootRef.current.render(element)
              }
            }}
          >
            run
          </button>
        </CodeEditor>
      </div>

      <div>
        <h3>Preview</h3>
        <div className='pad block' ref={portalRef} />
      </div>
    </div>
  )
}
