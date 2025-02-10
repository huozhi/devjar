'use client'

const CDN_HOST = 'https://esm.sh'

import { Editor } from 'codice'
import { DevJar } from 'devjar'
import FileTab from './file-tab'
import { useEffect, useState } from 'react'

export function Codesandbox({
  title,
  files: initialFiles
}: {
  title?: string
  files: Record<string, string>
}) {
  const [activeFile, setActiveFile] = useState('index.js')
  const [files, setFiles] = useState(initialFiles)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (initialFiles !== files) setFiles(initialFiles)
  }, [initialFiles])

  return (
    <div data-codesandbox>
      {title ? <h2>{title}</h2> : null}
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
        className="editor"
        controls={false}
        title={null}
        lineNumbers={false}
        fontSize={13}
        value={files[activeFile]}
        onChange={(code) => {
          setFiles({
            ...files,
            [activeFile]: code,
          })
        }}
      />
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
