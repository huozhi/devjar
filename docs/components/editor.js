import { highlight } from 'sugar-high'
import { useEffect, useState } from 'react'


export default function CodeEditor({
  children,
  onChange = () => {},
  defaultCode = ''
}) {
  const [text, setText] = useState(defaultCode)
  const [output, setOutput] = useState(highlight(text))

  function update(code) {
    if (!code) return
    const highlighted = highlight(code)
    setText(code)
    setOutput(highlighted)
    onChange(code)
  }

  async function onEnterText(event) {
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
        <textarea className="pad absolute-full code-input" value={text} onChange={onEnterText}></textarea>
      </div>
      {children}
    </div>
  )
}
