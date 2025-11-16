'use client'

import { Codesandbox } from '../ui/codesandbox'
import { CodeBlock } from '../ui/code-block'
import { RuntimeNav } from '../ui/runtime-nav'

const codeRuntimeExample = `\
import { DevJar } from 'devjar'

const files = {
  'index.js': \`export default function App() {
  return <h1>Hello World</h1>
}\`
}

function App() {
  return (
    <DevJar
      files={files}
      getModuleUrl={(m) => \`https://esm.sh/\${m}\`}
    />
  )
}`

const hookExample = `\
import { useLiveCode } from 'devjar'
import { useEffect, useState } from 'react'

function Playground() {
  const { ref, error, load } = useLiveCode({
    getModuleUrl: (m) => \`https://esm.sh/\${m}\`
  })
  
  const [files, setFiles] = useState({
    'index.js': \`export default function App() {
  return <h1>Hello World</h1>
}\`
  })
  
  useEffect(() => {
    load(files)
  }, [files])
  
  return <iframe ref={ref} />
}`

export default function PlaygroundSection({ 
  codeRuntimeFiles
}: { 
  codeRuntimeFiles: Record<string, string>
}) {
  return (
    <>
      <div className="playground-container">
        <RuntimeNav active="react" />
        <div className="playground-wrapper">
          <Codesandbox files={codeRuntimeFiles} />
        </div>
      </div>
      
      <div className="usage-section">
        <div className="usage-content">
          <h2>Usage</h2>
          <div className="usage-example">
            <h3>React Runtime</h3>
            <p>
              Use the <code>DevJar</code> component to create interactive React code previews. 
              Pass your files as an object and provide a module resolver function to handle imports. 
              Devjar supports CSS imports and Tailwind CSS out of the box.
            </p>
            <CodeBlock code={codeRuntimeExample} />
            <h4>Using the Hook</h4>
            <p>
              For more control, use the <code>useLiveCode</code> hook directly. 
              It returns an iframe ref, error state, and a load function to execute your code files.
            </p>
            <CodeBlock code={hookExample} />
          </div>
        </div>
      </div>
    </>
  )
}


