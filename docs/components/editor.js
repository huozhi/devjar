import { highlight } from 'sugar-high'
import { useEffect, useState } from 'react'
import { createModule } from '../../lib/index.mjs'

export default function CodeEditor({ onAccessModule = () => {}, defaultCode = '' }) {
  const [text, setText] = useState(defaultCode)
  const [output, setOutput] = useState(highlight(text))

  function update(code) {
    const highlighted = highlight(code)
    setText(code)
    setOutput(highlighted)

    if (code) {
      async function callModule() {
        let mod = {}, error
        try {
          mod = await createModule(code)
        } catch (e) {
          error = e
        }
        return { mod, error }
      }
      onAccessModule(callModule)
    }
  }

  async function onChange(event) {
    const code = event.target.value || ''
    update(code)

  }

  useEffect(() => {
    update(text)
  }, [])
  return (
    <>
      <style jsx>{`
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
        }`}
      </style>
      <div className="flex">
        <div className="editor">
          <pre className="pre">
            <code className="pad" dangerouslySetInnerHTML={{ __html: output }}></code>
          </pre>
          <textarea className="pad absolute-full code-input" value={text} onChange={onChange}></textarea>
        </div>
      </div>
    </>
  )
}
