'use client'

import { useState } from 'react'

const kebabCase = (str: string) => str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
const removeExtension = (str: string) => str.replace(/\.[^/.]+$/, '')

function RootActions({ files, setFiles, setActiveFile }) {
  const [isEditingFile, setIsEditingFile] = useState(false)
  const [isEditingFolder, setIsEditingFolder] = useState(false)
  const [newFilename, setNewFilename] = useState('')

  const handleNewFileSubmit = () => {
    if (!newFilename.trim()) {
      setIsEditingFile(false)
      setNewFilename('')
      return
    }

    const uniqueFilename = newFilename.trim()
    const fileBaseName = removeExtension(uniqueFilename)
    setFiles({
      ...files,
      [uniqueFilename]: `export default function ${kebabCase(fileBaseName)}() {}`,
    })
    setActiveFile(uniqueFilename)
    setNewFilename('')
    setIsEditingFile(false)
  }

  const handleNewFolderSubmit = () => {
    // For now, folders are not fully implemented, so we'll just dismiss
    setIsEditingFolder(false)
    setNewFilename('')
  }

  return (
    <div className="root-actions">
      <button
        className="root-action-button"
        aria-label="New file"
        onClick={() => {
          setIsEditingFile(true)
          setIsEditingFolder(false)
        }}
        title="New file"
      >
        <svg width="16" height="18" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 2.5C3 2.22 3.22 2 3.5 2H8L9.5 3.5V11.5C9.5 11.78 9.28 12 9 12H3.5C3.22 12 3 11.78 3 11.5V2.5Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="8.5" cy="10.25" r="2.5" fill="#fafafa" stroke="none"/>
          <line x1="8.5" y1="9" x2="8.5" y2="11.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          <line x1="7" y1="10.25" x2="10" y2="10.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        className="root-action-button"
        aria-label="New folder"
        onClick={() => {
          setIsEditingFolder(true)
          setIsEditingFile(false)
        }}
        title="New folder"
      >
        <svg width="18" height="18" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.5 3.5C2.5 3.22 2.72 3 3 3H5.5L7 4.5H10.5C10.78 4.5 11 4.72 11 5V11.5C11 11.78 10.78 12 10.5 12H3C2.72 12 2.5 11.78 2.5 11.5V3.5Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9.5" cy="10.25" r="2.5" fill="#fafafa" stroke="none"/>
          <line x1="9.5" y1="9" x2="9.5" y2="11.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          <line x1="8" y1="10.25" x2="11" y2="10.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      </button>
      {(isEditingFile || isEditingFolder) && (
        <input
          type="text"
          className="root-action-input"
          value={newFilename}
          placeholder={isEditingFile ? "filename.js" : "foldername"}
          autoFocus
          onChange={(e) => setNewFilename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (isEditingFile) {
                handleNewFileSubmit()
              } else {
                handleNewFolderSubmit()
              }
            } else if (e.key === 'Escape') {
              setIsEditingFile(false)
              setIsEditingFolder(false)
              setNewFilename('')
            }
          }}
          onBlur={() => {
            if (isEditingFile) {
              handleNewFileSubmit()
            } else {
              handleNewFolderSubmit()
            }
          }}
        />
      )}
    </div>
  )
}

export default RootActions

