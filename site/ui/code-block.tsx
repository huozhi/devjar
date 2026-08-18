import { highlight } from 'sugar-high'

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="code-block">
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlight(code, { lang: 'typescript' }) }} />
      </pre>
    </div>
  )
}
