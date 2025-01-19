'use client'

import { useState } from 'react'
import { Editor } from 'codice'
import { DevJar } from 'devjar'
import { highlight } from 'sugar-high'
import FileTab from '../ui/file-tab'

const CDN_HOST = 'https://esm.sh'

const defaultFiles = {
  'index.js': `\
  import { useState } from 'react'

  import Text from './text'
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
  './text.js': `\
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
  `,
}

export default function Page() {
  const [activeFile, setActiveFile] = useState('index.js')
  const [files, setFiles] = useState(defaultFiles)
  const [error, setError] = useState(null)

  return (
    <div>
      <div>
        <h1>Devjar</h1>
        <p>
          A live-code runtime for React, running directly in the browser. Perfect for interactive demos, documentation,
          and real-time code previews. Simple to integrate and highly flexible for any React project.
        </p>
        <br />
        <div className="filetree">
          {Object.keys(files).map((filename) => (
            <div
              role="button"
              key={filename}
              data-disabled={filename === activeFile}
              className={'filetab filetab--' + (filename === activeFile ? 'active' : '')}
              onClick={() => setActiveFile(filename)}
            >
              {filename + (filename.endsWith('.css') || filename.endsWith('.js') ? '' : '.js')}
            </div>
          ))}

          <FileTab files={files} setFiles={setFiles} setActiveFile={setActiveFile} />
        </div>
        <Editor
          highlight={highlight}
          className="editor"
          controls={false}
          title={null}
          value={files[activeFile]}
          onChange={(code) => {
            setFiles({
              ...files,
              [activeFile]: code,
            })
          }}
        />
      </div>

      <div className="preview">
        <DevJar
          className="preview--result"
          files={files}
          onError={(err) => {
            setError(err)
          }}
          getModuleUrl={(m) => {
            return `${CDN_HOST}/${m}`
          }}
        />
        {error && <pre className="preview--error" dangerouslySetInnerHTML={{ __html: error.toString() }} />}
      </div>
    </div>
  )
}
