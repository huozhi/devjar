'use client'

import React, { useState } from 'react'
import { Editor } from 'codice'
import { DevJar } from 'devjar'
import { highlight } from 'sugar-high'

const CDN_HOST = 'https://esm.sh'

const defaultFiles = {
  'index.js': `
  import { useState } from 'react'
  import useSWR from 'swr'
  import Text from './mod1'
  import './styles.css'

  export default function App() {
    const [num, inc] = useState(1)
    const { data } = useSWR('swr', key => key)
    return (
      <div>
        <h1 className='title'>devjar</h1>
        <p>Hello <Text /> with {data}</p>
        <p>No. {num}</p>
        <button onClick={() => inc(num + 1)}>increase</button>
      </div>
    )
  }`,
  './mod1': `
  import React from 'react'

  export default function Text() {
    return <b>devjar</b>
  }`,
  './styles.css': `
  .title {
    color: red;
  }
  `
}

export default function Page() {
  const [activeFile, setActiveFile] = useState('index.js')
  const [files, setFiles] = useState(defaultFiles)
  const [error, setError] = useState(null)

  return (
    <>
      <div>
        <div className='filetree'>
          {Object.keys(files).map((filename) => (
            <div
              role='button'
              key={filename}
              disabled={filename === activeFile}
              className={'filetab filetab--' + (filename === activeFile ? 'active' : '')}
              onClick={() => setActiveFile(filename)}
            >
              {filename + ((filename.endsWith('.css') || filename.endsWith('.js')) ? '' : '.js')}
            </div>
          ))}

          <div
            role='button'
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
            {`+`}
          </div>
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

      <div className='preview'>
        <DevJar
          className='preview--result'
          files={files}
          onError={(err) => {
            setError(err)
          }}
          getModuleUrl={(m) => {
            if (m === 'react' || m === 'react-dom' || m === 'swr') {
              return `${CDN_HOST}/${m}@latest`
            }

            return `${CDN_HOST}/${m}`
          }}
        />
        {error && <pre className='preview--error' dangerouslySetInnerHTML={{ __html: error.toString() }} />}
      </div>
    </>
  )
}
