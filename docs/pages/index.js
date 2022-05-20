import React, { useEffect, useState, useCallback } from 'react'
import { debounce } from 'lodash-es'
import { Editor } from 'codice'
import { useLiveCode } from 'devjar'
import { highlight } from 'sugar-high'

export default function Page() {
  const [activeFile, setActiveFile] = useState('index.js')
  const [files, setFiles] = useState({
    'index.js':
`import React from 'react'
import useSWR from 'swr'
import Name from './mod1'

export default function App() {
  const { data } = useSWR('swr', (key) => key)
  return <div>Hello <Name /> with {data}</div>
}
`,
    './mod1':
`import React from 'react'

export default function Name() {
  return <b>devjar</b>
}
`,
  })

  const { ref, error, load } = useLiveCode({
    getModulePath(modPath) {
      return `https://cdn.skypack.dev/${modPath}`
    }
  })
  const debouncedLoad = useCallback(debounce(load, 200), [])

  useEffect(() => {
    if (error)
      console.error(error)
  }, [error])

  useEffect(() => {
    debouncedLoad(files)
  }, [files])

  return (
    <div>
      <div>
        <h1>Devjar</h1>
        <p>Bundless runtime for your ESM JavaScript project in browser.</p>
        <br />
      </div>

      <div>
        <h3>Code Editor</h3>
        <div className='filetree'>
          <div>
            {Object.keys(files).map((filename) => (
              <button
                key={filename}
                disabled={filename === activeFile}
                className={'filetab filetab--' + (filename === activeFile ? 'active' : '')}
                onClick={() => setActiveFile(filename)}
              >
                {filename + (filename.endsWith('.js') ? '' : '.js')}
              </button>
            ))}
          </div>
          <button
            className='filetab filetab--new'
            onClick={() => {
              const modId = Object.keys(files).length
              const newFilename = './mod' + modId
              setFiles({
                ...files,
                [newFilename]: `export default function Mod${modId}() {}`,
              })
              setActiveFile(newFilename)
            }}
          >
            {`+ new`}
          </button>
        </div>
        <Editor
          highlight={highlight}
          className='editor'
          value={files[activeFile]}
          onChange={(code) => {
            setFiles({
              ...files,
              [activeFile]: code,
            })
          }}
        />
      </div>

      <div>
        <h3>Preview</h3>
        <iframe className='preview' ref={ref} />
      </div>
    </div>
  )
}
