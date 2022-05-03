import React, { useEffect, useState, useCallback } from 'react'
import { debounce } from 'lodash-es'
import { Editor } from 'codice'
import { useLiveCode } from 'devjar/react'

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
  return <b>vevjar</b>
}
`,
  })

  const { ref, load } = useLiveCode({
    getModulePath(modPath) {
      const prefix = 'https://esm.sh/'
      if (modPath === 'es-module-shims') {
        return `${prefix}${modPath}`
      }
      if (modPath.includes('/')) {
        const idx = modPath.indexOf('/')
        const pkg = modPath.slice(0, idx)
        const path = modPath.slice(idx + 1)
        return `${prefix}${pkg}?bundle&path=${path}`
      }
      return `${prefix}${modPath}?bundle`
    }
  })
  const debouncedLoad = useCallback(debounce(load, 200), [])

  useEffect(() => {
    debouncedLoad(files)
  }, [files])

  return (
    <div>
      <div>
        <h3>Code</h3>
        {Object.keys(files).map((filename) => (
          <button
            key={filename}
            disabled={filename === activeFile}
            onClick={() => setActiveFile(filename)}
          >
            {filename}
          </button>
        ))}
        <button
          onClick={() => {
            const newFilename = './mod' + Object.keys(files).length
            setFiles({
              ...files,
              [newFilename]: `export default function () {}`,
            })
            setActiveFile(newFilename)
          }}
        >
          +
        </button>
        <Editor
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
