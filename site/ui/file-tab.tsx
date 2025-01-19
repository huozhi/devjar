'use client'

import React, { useState } from 'react'

const kebabCase = (str: string) => str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
const removeExtension = (str: string) => str.replace(/\.[^/.]+$/, '')

function FileTab({ files, setFiles, setActiveFile }) {
  const [isEditing, setIsEditing] = useState(false)
  const [newFilename, setNewFilename] = useState('')

  const handleNewFileSubmit = () => {
    if (!newFilename.trim()) {
      // dismiss, turn back to non-editing mode
      setIsEditing(false)
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
    setIsEditing(false)
  }

  return (
    <div className="filetab filetab--new" role="button">
      {isEditing ? (
        <input
          type="text"
          className="filetab__input"
          value={newFilename}
          placeholder="filename (e.g. foo.js)"
          autoFocus
          onChange={(e) => setNewFilename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleNewFileSubmit()
            } else if (e.key === 'Escape') {
              setIsEditing(false)
              setNewFilename('')
            }
          }}
          onBlur={handleNewFileSubmit}
        />
      ) : (
        <button className="filetab__button" onClick={() => setIsEditing(true)} aria-label="Add new file">
          + New
        </button>
      )}
    </div>
  )
}

export default FileTab
