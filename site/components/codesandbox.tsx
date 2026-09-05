'use client'

import './codesandbox.css'
import { demoContentJson, demoContentPresets } from '../lib/demo-files'

const CDN_HOST = 'https://esm.sh'
const REACT_DEV_MODULES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
])
const editorTextareaProps = { style: { caretColor: '#171717' } }

function resolveModule(specifier: string) {
  if (specifier === '@react-three/fiber') return `${CDN_HOST}/@react-three/fiber@9.3.0?deps=react@19.2.8,react-dom@19.2.8,three@0.180.0&dev&bundle`
  if (specifier === 'three') return `${CDN_HOST}/three@0.180.0?dev`
  if (specifier === 'swr' || specifier.startsWith('swr/')) {
    return `${CDN_HOST}/${specifier.replace(/^swr/, 'swr@2.5.1')}?deps=react@19.2.8&dev`
  }
  const pinned = specifier.replace(/^(react|react-dom)(?=\/|$)/, '$1@19.2.8')
  const url = `${CDN_HOST}/${pinned}`
  return REACT_DEV_MODULES.has(specifier) ? `${url}?dev` : url
}

import { Editor } from '@sugar-high/react'
import { taffy } from '@sugar-high/react/themes'
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

const previewLoaderFrames = [
  '[■·······]',
  '[·■······]',
  '[··■·····]',
  '[···■····]',
  '[····■···]',
  '[·····■··]',
  '[······■·]',
  '[·······■]',
]

export function Codesandbox({
  files: initialFiles,
  focusFile,
  editorAction,
}: {
  files: Record<string, string>
  focusFile: string | undefined
  editorAction: { label: string; generate: (code: string) => string; playback: boolean } | undefined
}) {
  // Initialize activeFile with the root page when available.
  const getInitialActiveFile = (files: Record<string, string>) => {
    if (focusFile) return focusFile
    if (files['content.json']) return 'content.json'
    const rootPage = ['pages/index.tsx', 'pages/index.ts', 'pages/index.jsx', 'pages/index.js']
      .find(filename => filename in files)
    if (rootPage) return rootPage
    const firstKey = Object.keys(files)[0]
    return firstKey || 'pages/index.tsx'
  }

  const [activeFile, setActiveFile] = useState<string | null>(() => getInitialActiveFile(initialFiles))
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [files, setFiles] = useState(initialFiles)
  const [folders, setFolders] = useState<string[]>([])
  const [editingNewItem, setEditingNewItem] = useState<{ type: 'file' | 'folder'; tempId: string } | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set())
  const previewRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const editorLayoutRef = useRef<HTMLDivElement>(null)
  const [previewHeight, setPreviewHeight] = useState(focusFile ? 360 : 340)
  const [previewEnabled, setPreviewEnabled] = useState(!focusFile)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const activeExtension = activeFile?.split('.').pop() || ''
  const projectFolders = [...new Set([
    ...folders,
    ...Object.keys(files).flatMap((filename) => {
      const path = normalizeFilename(filename)
      const separator = path.indexOf('/')
      return separator === -1 ? [] : [path.slice(0, separator)]
    }),
  ])]

  useEffect(() => {
    if (previewEnabled) return
    const preview = previewRef.current
    if (!preview) return
    if (typeof IntersectionObserver === 'undefined') {
      setPreviewEnabled(true)
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setPreviewEnabled(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(preview)
    return () => observer.disconnect()
  }, [previewEnabled])

  useEffect(() => {
    const preview = previewRef.current
    if (!editorAction?.playback || !preview || !previewReady || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => !entry.isIntersecting)) {
        iframeRef.current?.contentWindow?.postMessage({ type: 'devjar:stop-playback' }, window.location.origin)
      }
    })
    observer.observe(preview)
    return () => observer.disconnect()
  }, [editorAction?.playback, previewReady])

  useEffect(() => {
    const handleEditRequest = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data?.type === 'devjar:playback' && typeof event.data.playing === 'boolean') {
        setPreviewPlaying(event.data.playing)
        return
      }
      if (event.data !== 'devjar:change-content') return
      setFiles(current => {
        if (!current['content.json']) return current
        const index = demoContentPresets.findIndex(content => demoContentJson(content) === current['content.json'])
        return {
          ...current,
          'content.json': demoContentJson(demoContentPresets[(index + 1) % demoContentPresets.length]),
        }
      })
      setActiveFile('content.json')
    }

    window.addEventListener('message', handleEditRequest)
    return () => window.removeEventListener('message', handleEditRequest)
  }, [])

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

      const content = doc.getElementById('__reactRoot')
      const nextHeight = content
        ? Math.ceil(Math.max(content.getBoundingClientRect().height, content.scrollHeight, focusFile ? 360 : 340))
        : Math.ceil(Math.max(
        doc.body?.scrollHeight || 0,
        doc.body?.offsetHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        doc.documentElement?.offsetHeight || 0,
        340
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
  }, [focusFile, previewEnabled])

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
    if (focusFile) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.target instanceof Node) || !editorLayoutRef.current?.contains(e.target)) return
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
  }, [activeFile, activeFolder, files, folders, editingNewItem, focusFile])

  return (
    <div data-codesandbox="react" data-focused={focusFile ? "true" : undefined}>
      <div className="preview" ref={previewRef} style={{ height: previewHeight }}>
        <div className={previewReady ? 'preview--loading is-hidden' : 'preview--loading'} aria-hidden="true">
          <div className="preview--loading-ascii">
            <span className="preview--loading-frames">
              {previewLoaderFrames.map((frame) => <span key={frame}>{frame}</span>)}
            </span>
            <span className="preview--loading-label">rendering preview</span>
          </div>
        </div>
        {previewEnabled && <DevJar
          tailwind={!focusFile}
          className={'preview--result ' + (previewReady ? 'is-ready' : '')}
          files={files}
          ref={iframeRef}
          scrolling="no"
          onError={(err) => {
            if (err) console.error(err)
          }}
          resolveModule={resolveModule}
        />}
      </div>
      <div className="codesandbox-layout" ref={editorLayoutRef} data-editor-action={editorAction ? "true" : undefined}>
        {!focusFile && <div className="filetree">
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
            {projectFolders.map((folderName) => {
              const folderFiles = Object.keys(files).filter(f => normalizeFilename(f).startsWith(folderName + '/'))
              const isActiveFolder = activeFolder === folderName
              return (
                <div key={folderName}>
                  <div
                    role="button"
                    className={'filetree-item filetree-item--folder ' + (isActiveFolder ? 'active' : '') + (deletingItems.has(folderName) ? ' filetree-item--deleting' : '')}
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
                  <div className="filetree-children">
                    {folderFiles.map((filename) => {
                      const path = normalizeFilename(filename)
                      const displayName = getDisplayName(path.slice(folderName.length + 1))
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
                </div>
              )
            })}
            {Object.keys(files).filter(f => !projectFolders.some(folder => normalizeFilename(f).startsWith(folder + '/'))).map((filename) => {
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
        </div>}
        {focusFile && <div className="focused-editor-heading">
          <span>{focusFile}</span>
          <button onClick={() => setFiles(initialFiles)}>Reset code ↺</button>
        </div>}
          <Editor
            theme={taffy.light}
            className="editor"
            controls={false}
            title={null}
            lineNumbers={true}
            fontSize={13}
            fontFamily="var(--font-ioskeley-mono)"
            textareaProps={editorTextareaProps}
            extension={activeExtension}
            data-active-extension={activeExtension}
            value={activeFile ? files[activeFile] || '' : ''}
            onChange={(code) => {
              if (activeFile) {
                setFiles((currentFiles) => ({
                  ...currentFiles,
                  [activeFile]: code,
                }))
              }
            }}
          />
        {editorAction && focusFile && <div className="floating-editor-action">
          <button onClick={() => setFiles(current => ({
            ...current,
            [focusFile]: editorAction.generate(current[focusFile]),
          }))}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 5h3c4 0 6 10 10 10h3m-4-4 4 4-4 4M2 15h3c1.5 0 3-1.5 4-3m2-4c1-1.5 2.5-3 4-3h3m-4-4 4 4-4 4" />
            </svg>
            {editorAction.label}
          </button>
          {editorAction.playback && <button className="playback-action" disabled={!previewReady} aria-pressed={previewPlaying}
            onClick={() => iframeRef.current?.contentWindow?.postMessage({ type: 'devjar:toggle-playback' }, window.location.origin)}>
            <span aria-hidden="true">{previewPlaying ? '■' : '▶'}</span>{previewPlaying ? 'Stop' : 'Play'}
          </button>}
        </div>}
      </div>
    </div>
  )
}
