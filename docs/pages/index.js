import { useRef } from 'react'
import CodeEditor from '../components/editor'

const defaultText = `console.log('hi'); export default () => (2 + 2);`

export default function Page() {
  const accessModuleRef = useRef(() => {})

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
      }`}</style>
      <CodeEditor
        defaultCode={defaultText}
        onAccessModule={(fn) => {
          accessModuleRef.current = fn
        }}
      />
      <button
        onClick={async () => {
          const accessModule = accessModuleRef.current
          const { mod, error } = await accessModule()
          if (error) {
            console.error(error)
          } else {
            console.log('mod', mod)
            const sumUp = mod.default
            console.log('`return` of mod.default() = ', sumUp())
          }
        }}
      >run</button>
    </div>
  )
}