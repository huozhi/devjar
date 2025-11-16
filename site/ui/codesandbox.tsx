'use client'

import './codesandbox.css'

const CDN_HOST = 'https://esm.sh'

import { Editor } from 'codice'
import { DevJar } from 'devjar'
import FileIcon from './file-icon'
import RootActions from './root-actions'
import { useEffect, useState } from 'react'

// Normalize filename - remove leading ./ and ensure proper extension
function normalizeFilename(filename: string): string {
  return filename.startsWith('./') ? filename.slice(2) : filename
}

// Get display name for file tree (just the filename without path)
function getDisplayName(filename: string): string {
  const normalized = normalizeFilename(filename)
  // If it already has an extension, return as is, otherwise add .js
  if (normalized.includes('.')) {
    return normalized
  }
  return normalized + '.js'
}

export function Codesandbox({
  files: initialFiles
}: {
  files: Record<string, string>
}) {
  // Initialize activeFile with first available file, preferring index.js
  const getInitialActiveFile = (files: Record<string, string>) => {
    if (files['index.js']) return 'index.js'
    const firstKey = Object.keys(files)[0]
    return firstKey || 'index.js'
  }
  
  const [activeFile, setActiveFile] = useState(() => getInitialActiveFile(initialFiles))
  const [files, setFiles] = useState(initialFiles)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (initialFiles !== files) {
      setFiles(initialFiles)
      // Update activeFile if current one doesn't exist in new files
      if (!initialFiles[activeFile]) {
        setActiveFile(getInitialActiveFile(initialFiles))
      }
    }
  }, [initialFiles])

  return (
    <div data-codesandbox>
      <div className="codesandbox-layout">
        <div className="filetree">
          <div className="filetree-root">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="react-icon">
              <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1" fill="none"/>
              <ellipse cx="12" cy="12" rx="11" ry="4.2" stroke="currentColor" strokeWidth="1" fill="none"/>
              <ellipse cx="12" cy="12" rx="11" ry="4.2" stroke="currentColor" strokeWidth="1" fill="none" transform="rotate(60 12 12)"/>
              <ellipse cx="12" cy="12" rx="11" ry="4.2" stroke="currentColor" strokeWidth="1" fill="none" transform="rotate(-60 12 12)"/>
            </svg>
            <RootActions files={files} setFiles={setFiles} setActiveFile={setActiveFile} />
          </div>
          <div className="filetree-files">
            {Object.keys(files).map((filename) => {
              const displayName = getDisplayName(filename)
              return (
                <div
                  role="button"
                  key={filename}
                  className={'filetree-item ' + (filename === activeFile ? 'active' : '')}
                  onClick={() => setActiveFile(filename)}
                >
                  <FileIcon />
                  <span className="filetree-item-name">{displayName}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="codesandbox-content">
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
      </div>
    </div>
  )
}
