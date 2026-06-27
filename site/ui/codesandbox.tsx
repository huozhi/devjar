'use client'

import './codesandbox.css'

const CDN_HOST = 'https://esm.sh'
const REACT_DEV_MODULES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
])

function getModuleUrl(moduleName: string) {
  const url = `${CDN_HOST}/${moduleName}`
  return REACT_DEV_MODULES.has(moduleName) ? `${url}?dev` : url
}

import { Editor } from 'codice'
import { DevJar } from 'devjar'
import FileIcon from './file-icon'
import RootActions from './root-actions'
import { useEffect, useRef, useState } from 'react'

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

const loaderChars = '░▒▓█▄▀■□▪▫'

function loaderChar(index: number, frame: number) {
  return loaderChars[(index * 17 + frame * 11) % loaderChars.length]
}

function scrambleText(text: string, frame: number) {
  let index = 0
  return text.replace(/\S/g, () => loaderChar(index++, frame))
}

function scrambleTemplate(template: string, frame: number) {
  let index = 0
  return template.replace(/x/g, () => loaderChar(index++, frame))
}

function renderLoaderCells(text: string, frame: number) {
  return Array.from(scrambleText(text, frame), (char, index) => (
    <span className={char === ' ' ? 'preview--loading-cell is-space' : 'preview--loading-cell'} key={index}>
      {char === ' ' ? '\u00a0' : char}
    </span>
  ))
}

const previewFallbackArtTemplate = [
  '           DEVJAR             ',
  '  .------------------------.  ',
  ' /  xxxxxx        xxxxxxx  /| ',
  '+------------------------+  | ',
  '| xxxxxxxx               |  | ',
  '|                        |  | ',
  '|  xxxxxxxxxxxxxxxxxx    |  | ',
  '|  xxxxxxxxxxxxxx        |  | ',
  '|                        |  | ',
  '|  .------------------.  |  | ',
  '|  |                  |  |  | ',
  '|  |    xxxxxxxxxx    |  |  | ',
  '|  |                  |  |  | ',
  '|  +------------------+  | /  ',
  '+------------------------+    ',
]

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
  
  const [activeFile, setActiveFile] = useState<string | null>(() => getInitialActiveFile(initialFiles))
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [files, setFiles] = useState(initialFiles)
  const [error, setError] = useState(null)
  const [folders, setFolders] = useState<string[]>([])
  const [editingNewItem, setEditingNewItem] = useState<{ type: 'file' | 'folder'; tempId: string } | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set())
  const previewRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewHeight, setPreviewHeight] = useState(440)
  const [previewReady, setPreviewReady] = useState(false)
  const [loaderFrame, setLoaderFrame] = useState(0)

  useEffect(() => {
    if (previewReady) return
    const interval = window.setInterval(() => {
      setLoaderFrame((frame) => (frame + 1) % 997)
    }, 120)

    return () => window.clearInterval(interval)
  }, [previewReady])

  useEffect(() => {
    const iframe = iframeRef.current
    const preview = previewRef.current
    if (!iframe || !preview) return

    let resizeObserver: ResizeObserver | undefined
    let frame = 0
    let probeFrame = 0
    let rendered = false

    const updateHeight = () => {
      frame = 0
      const doc = iframe.contentDocument
      if (!doc) return

      const nextHeight = Math.ceil(Math.max(
        doc.body?.scrollHeight || 0,
        doc.body?.offsetHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        doc.documentElement?.offsetHeight || 0,
        440
      ))

      setPreviewHeight(nextHeight)
    }

    const scheduleUpdate = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateHeight)
    }

    const markReady = () => {
      rendered = true
      setPreviewReady(true)
      scheduleUpdate()
    }

    const detectRenderedContent = () => {
      if (rendered) return true

      const doc = iframe.contentDocument
      const root = doc?.getElementById('__reactRoot')
      if (!root) return false

      if (root.childElementCount > 0 || root.textContent?.trim()) {
        markReady()
        return true
      }

      return false
    }

    const probeReady = () => {
      probeFrame = 0
      if (detectRenderedContent()) return
      probeFrame = requestAnimationFrame(probeReady)
    }

    const scheduleReadyProbe = () => {
      if (!rendered && !probeFrame) {
        probeFrame = requestAnimationFrame(probeReady)
      }
    }

    const setupObserver = () => {
      scheduleUpdate()
      scheduleReadyProbe()
      const doc = iframe.contentDocument
      if (!doc || typeof ResizeObserver === 'undefined') return
      resizeObserver?.disconnect()
      resizeObserver = new ResizeObserver(scheduleUpdate)
      resizeObserver.observe(doc.documentElement)
      if (doc.body) resizeObserver.observe(doc.body)
    }

    iframe.addEventListener('load', setupObserver)
    iframe.addEventListener('devjar:render', markReady)
    window.addEventListener('resize', scheduleUpdate)
    setupObserver()

    return () => {
      iframe.removeEventListener('load', setupObserver)
      iframe.removeEventListener('devjar:render', markReady)
      window.removeEventListener('resize', scheduleUpdate)
      resizeObserver?.disconnect()
      if (frame) cancelAnimationFrame(frame)
      if (probeFrame) cancelAnimationFrame(probeFrame)
    }
  }, [])

  useEffect(() => {
    if (initialFiles !== files) {
      setFiles(initialFiles)
      // Update activeFile if current one doesn't exist in new files
      if (activeFile && !initialFiles[activeFile]) {
        setActiveFile(getInitialActiveFile(initialFiles))
      }
    }
  }, [initialFiles])

  // Handle Cmd+Delete or Cmd+Backspace to delete files/folders
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Delete or Cmd+Backspace (Mac) or Ctrl+Delete/Backspace (Windows/Linux)
      const isDelete = (e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace')
      
      if (isDelete && !editingNewItem) {
        e.preventDefault()
        
        if (activeFolder) {
          // Delete folder and all its files
          const folderFiles = Object.keys(files).filter(f => f.startsWith(activeFolder + '/'))
          const itemsToDelete = [activeFolder, ...folderFiles]
          
          setDeletingItems(new Set(itemsToDelete))
          
          setTimeout(() => {
            const newFiles = { ...files }
            folderFiles.forEach(f => delete newFiles[f])
            setFiles(newFiles)
            setFolders(folders.filter(f => f !== activeFolder))
            setActiveFolder(null)
            setActiveFile(getInitialActiveFile(newFiles))
            setDeletingItems(new Set())
          }, 200) // Match animation duration
        } else if (activeFile) {
          // Delete file
          setDeletingItems(new Set([activeFile]))
          
          setTimeout(() => {
            const newFiles = { ...files }
            delete newFiles[activeFile]
            setFiles(newFiles)
            setActiveFile(getInitialActiveFile(newFiles))
            setDeletingItems(new Set())
          }, 200) // Match animation duration
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeFile, activeFolder, files, folders, editingNewItem])

  return (
    <div data-codesandbox="react">
      <div className="preview" ref={previewRef} style={{ height: previewHeight }}>
        <div className={previewReady ? 'preview--loading is-hidden' : 'preview--loading'} aria-hidden="true">
          <div className="preview--loading-copy">
            <h1>Devjar</h1>
            <p className="preview--loading-kicker">
              <span className="preview--loading-measure">
                React Live Preview in browser
                <span className="preview--loading-noise">{renderLoaderCells('React Live Preview in browser', loaderFrame)}</span>
              </span>
            </p>
            <button className="preview--loading-button" type="button" tabIndex={-1}>
              <span className="preview--loading-measure">
                Wiggle
                <span className="preview--loading-noise">{renderLoaderCells('Wiggle', loaderFrame + 2)}</span>
              </span>
            </button>
          </div>
          <pre className="preview--loading-art">
            {previewFallbackArtTemplate.map((line, index) => (
              <span key={index}>{scrambleTemplate(line, loaderFrame + index)}</span>
            ))}
          </pre>
        </div>
        <DevJar
          className={'preview--result ' + (previewReady ? 'is-ready' : '')}
          files={files}
          ref={iframeRef}
          scrolling="no"
          onError={(err) => {
            setError(err)
          }}
          getModuleUrl={getModuleUrl}
        />
        {error && <pre className="preview--error" dangerouslySetInnerHTML={{ __html: error.toString() }} />}
      </div>
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
                // Keep activeFolder if one is selected, so file is created under it
              }}
              onNewFolder={() => {
                const tempId = `__new_folder_${Date.now()}__`
                setEditingNewItem({ type: 'folder', tempId })
                setNewItemName('')
                setActiveFolder(null)
              }}
            />
          </div>
          <div className="filetree-files">
            {folders.map((folderName) => {
              const folderFiles = Object.keys(files).filter(f => f.startsWith(folderName + '/'))
              const isActiveFolder = activeFolder === folderName
              return (
                <div key={folderName}>
                  <div
                    role="button"
                    className={'filetree-item ' + (isActiveFolder ? 'active' : '') + (deletingItems.has(folderName) ? ' filetree-item--deleting' : '')}
                    onClick={() => {
                      setActiveFolder(folderName)
                      setActiveFile(null)
                    }}
                  >
                    <svg width="16" height="18" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="file-icon">
                      <path d="M2.5 3.5C2.5 3.22 2.72 3 3 3H5.5L7 4.5H10.5C10.78 4.5 11 4.72 11 5V11.5C11 11.78 10.78 12 10.5 12H3C2.72 12 2.5 11.78 2.5 11.5V3.5Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="filetree-item-name">{folderName}</span>
                  </div>
                  {folderFiles.map((filename) => {
                    const displayName = getDisplayName(filename.replace(folderName + '/', ''))
                    return (
                      <div
                        role="button"
                        key={filename}
                        className={'filetree-item filetree-item--nested ' + (filename === activeFile ? 'active' : '') + (deletingItems.has(filename) ? ' filetree-item--deleting' : '')}
                        onClick={() => {
                          setActiveFile(filename)
                          setActiveFolder(null)
                        }}
                      >
                        <FileIcon />
                        <span className="filetree-item-name">{displayName}</span>
                      </div>
                    )
                  })}
                  {isActiveFolder && editingNewItem && editingNewItem.type === 'file' && (
                    <div className="filetree-item filetree-item--editing filetree-item--nested">
                      <FileIcon />
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
                            
                            const baseFilename = trimmed.includes('.') ? trimmed : trimmed + '.js'
                            const filename = `${folderName}/${baseFilename}`
                            const fileBaseName = removeExtension(baseFilename)
                            setFiles({
                              ...files,
                              [filename]: `export default function ${kebabCase(fileBaseName)}() {}`,
                            })
                            setActiveFile(filename)
                            setActiveFolder(null)
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
                          
                          const baseFilename = trimmed.includes('.') ? trimmed : trimmed + '.js'
                          const filename = `${folderName}/${baseFilename}`
                          const fileBaseName = removeExtension(baseFilename)
                          setFiles({
                            ...files,
                            [filename]: `export default function ${kebabCase(fileBaseName)}() {}`,
                          })
                          setActiveFile(filename)
                          setActiveFolder(null)
                          setEditingNewItem(null)
                          setNewItemName('')
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {Object.keys(files).filter(f => !folders.some(folder => f.startsWith(folder + '/'))).map((filename) => {
              const displayName = getDisplayName(filename)
              return (
                <div
                  role="button"
                  key={filename}
                  className={'filetree-item ' + (filename === activeFile ? 'active' : '') + (deletingItems.has(filename) ? ' filetree-item--deleting' : '')}
                  onClick={() => {
                    setActiveFile(filename)
                    setActiveFolder(null)
                  }}
                >
                  <FileIcon />
                  <span className="filetree-item-name">{displayName}</span>
                </div>
              )
            })}
            {editingNewItem && !(activeFolder && editingNewItem.type === 'file') && (
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
                        const baseFilename = trimmed.includes('.') ? trimmed : trimmed + '.js'
                        const filename = activeFolder ? `${activeFolder}/${baseFilename}` : baseFilename
                        const fileBaseName = removeExtension(baseFilename)
                        setFiles({
                          ...files,
                          [filename]: `export default function ${kebabCase(fileBaseName)}() {}`,
                        })
                        setActiveFile(filename)
                        setActiveFolder(null)
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
                      const baseFilename = trimmed.includes('.') ? trimmed : trimmed + '.js'
                      const filename = activeFolder ? `${activeFolder}/${baseFilename}` : baseFilename
                      const fileBaseName = removeExtension(baseFilename)
                      setFiles({
                        ...files,
                        [filename]: `export default function ${kebabCase(fileBaseName)}() {}`,
                      })
                      setActiveFile(filename)
                      setActiveFolder(null)
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
            lineNumbers={true}
            fontSize={13}
            value={activeFile ? files[activeFile] || '' : ''}
            onChange={(code) => {
              if (activeFile) {
                setFiles({
                  ...files,
                  [activeFile]: code,
                })
              }
            }}
          />
      </div>
    </div>
  )
}
