import { Code } from 'codice'

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="code-block">
      <Code
        fontSize={13}
      >
        {code}
      </Code>
    </div>
  )
}

