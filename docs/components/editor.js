import { highlight } from 'sugar-high'
import { useEffect, useState } from 'react'
import { loadModule } from '../../lib/index.mjs'

export default function CodeEditor({
  children,
  onAccessModule = () => {},
  defaultCode = ''
}) {
  const [text, setText] = useState(defaultCode)
  const [output, setOutput] = useState(highlight(text))

  function update(code) {
    const highlighted = highlight(code)
    setText(code)
    setOutput(highlighted)

    if (code) {
      onAccessModule(() => loadModule(code))
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
    <div className="block">
      <div className="editor">
        <pre className="pre">
          <code className="pad" dangerouslySetInnerHTML={{ __html: output }}></code>
        </pre>
        <textarea className="pad absolute-full code-input" value={text} onChange={onChange}></textarea>
      </div>
      {children}
    </div>
  )
}
