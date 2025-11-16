'use client'

import './codesandbox.css'

const CDN_HOST = 'https://esm.sh'

import { Editor } from 'codice'
import { DevJar } from 'devjar'
import FileIcon from './file-icon'
import RootActions from './root-actions'
import { useEffect, useState } from 'react'

const kebabCase = (str: string) => str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
const removeExtension = (str: string) => str.replace(/\.[^/.]+$/, '')

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
  const [folders, setFolders] = useState<string[]>([])
  const [editingNewItem, setEditingNewItem] = useState<{ type: 'file' | 'folder'; tempId: string } | null>(null)
  const [newItemName, setNewItemName] = useState('')

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
            <RootActions 
              onNewFile={() => {
                const tempId = `__new_file_${Date.now()}__`
                setEditingNewItem({ type: 'file', tempId })
                setNewItemName('')
              }}
              onNewFolder={() => {
                const tempId = `__new_folder_${Date.now()}__`
                setEditingNewItem({ type: 'folder', tempId })
                setNewItemName('')
              }}
            />
          </div>
          <div className="filetree-files">
            {folders.map((folderName) => (
              <div
                key={folderName}
                className="filetree-item"
              >
                <svg width="16" height="18" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="file-icon">
                  <path d="M2.5 3.5C2.5 3.22 2.72 3 3 3H5.5L7 4.5H10.5C10.78 4.5 11 4.72 11 5V11.5C11 11.78 10.78 12 10.5 12H3C2.72 12 2.5 11.78 2.5 11.5V3.5Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="filetree-item-name">{folderName}</span>
              </div>
            ))}
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
            {editingNewItem && (
              <div className="filetree-item filetree-item--editing">
                {editingNewItem.type === 'folder' ? (
                  <svg width="16" height="18" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="file-icon">
                    <path d="M2.5 3.5C2.5 3.22 2.72 3 3 3H5.5L7 4.5H10.5C10.78 4.5 11 4.72 11 5V11.5C11 11.78 10.78 12 10.5 12H3C2.72 12 2.5 11.78 2.5 11.5V3.5Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <FileIcon />
                )}
                <input
                  type="text"
                  className="filetree-item-input"
                  value={newItemName}
                  placeholder=""
                  autoFocus
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = newItemName.trim()
                      if (!trimmed) {
                        setEditingNewItem(null)
                        setNewItemName('')
                        return
                      }
                      
                      if (editingNewItem.type === 'file') {
                        const filename = trimmed.includes('.') ? trimmed : trimmed + '.js'
                        const fileBaseName = removeExtension(filename)
                        setFiles({
                          ...files,
                          [filename]: `export default function ${kebabCase(fileBaseName)}() {}`,
                        })
                        setActiveFile(filename)
                      } else {
                        // Create folder
                        if (!folders.includes(trimmed)) {
                          setFolders([...folders, trimmed])
                        }
                      }
                      
                      setEditingNewItem(null)
                      setNewItemName('')
                    } else if (e.key === 'Escape') {
                      setEditingNewItem(null)
                      setNewItemName('')
                    }
                  }}
                  onBlur={() => {
                    const trimmed = newItemName.trim()
                    if (!trimmed) {
                      setEditingNewItem(null)
                      setNewItemName('')
                      return
                    }
                    
                    if (editingNewItem.type === 'file') {
                      const filename = trimmed.includes('.') ? trimmed : trimmed + '.js'
                      const fileBaseName = removeExtension(filename)
                      setFiles({
                        ...files,
                        [filename]: `export default function ${kebabCase(fileBaseName)}() {}`,
                      })
                      setActiveFile(filename)
                    } else {
                      // Create folder
                      if (!folders.includes(trimmed)) {
                        setFolders([...folders, trimmed])
                      }
                    }
                    
                    setEditingNewItem(null)
                    setNewItemName('')
                  }}
                />
              </div>
            )}
          </div>
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
