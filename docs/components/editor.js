import { highlight } from 'sugar-high'
import { useEffect, useState } from 'react'

export default function CodeEditor({
  children,
  onChange = () => {},
  content = '',
}) {
  const [output, setOutput] = useState(highlight(content))

  function update(code) {
    if (!code) return
    const highlighted = highlight(code)
    setOutput(highlighted)
    onChange(code)
  }

  function onEnterText(event) {
    const code = event.target.value || ''
    update(code)
  }

  useEffect(() => {
    update(content)
  }, [content])

  return (
    <div className='block'>
      <div className='editor'>
        <pre className='pre'>
          <code className='pad' dangerouslySetInnerHTML={{ __html: output }} />
        </pre>
        <textarea
          className='pad absolute-full code-input'
          value={content}
          onChange={onEnterText}
        ></textarea>
      </div>
      {children}
    </div>
  )
}
