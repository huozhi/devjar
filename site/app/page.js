'use client'

import React, { useState } from 'react'
import { Editor } from 'codice'
import { DevJar } from 'devjar'
import { highlight } from 'sugar-high'

const CDN_HOST = 'https://esm.sh'

const defaultFiles = {
  'index.js': `\
  import { useState } from 'react'

  import Text from './mod1'
  import './styles.css'

  export default function App() {
    const [num, inc] = useState(1)
    
    return (
      <div>
        <h2 class="text-3xl">
          hello <Text />
        </h2>

        <p>Volume {Array(num % 6).fill('●').join('')}</p>
        <button className='button' onClick={() => inc(num + 1)}>increase</button>
      </div>
    )
  }`,
  './mod1': `\
  import React from 'react'

  export default function Text() {
    return <b>devjar</b>
  }`,
  './styles.css': `\
  html {
    font-family: ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji
  }
  .title {
    color: rgba(51, 65, 85);
    font-weight: 300;
    transition: color 0.2s ease-in-out;
  }
  .title:hover {
    color: rgba(23, 119, 195, 0.8);
  }

  .button {
    background: #eee;
    border: 1px solid #222;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 700;
    transition: color 0.2s ease-in-out;
  }
  .button:hover {
    background: #ddd;
    color: #222;
  }
  .button:active {
    background: #ccc;
    color: #222;
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
            return `${CDN_HOST}/${m}`
          }}
        />
        {error && <pre className='preview--error' dangerouslySetInnerHTML={{ __html: error.toString() }} />}
      </div>
    </>
  )
}
