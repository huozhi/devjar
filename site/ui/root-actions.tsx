'use client'

function RootActions({ onNewFile, onNewFolder }: { onNewFile: () => void; onNewFolder: () => void }) {
  return (
    <div className="root-actions">
      <button
        className="root-action-button"
        aria-label="New file"
        onClick={onNewFile}
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
        onClick={onNewFolder}
        title="New folder"
      >
        <svg width="18" height="18" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.5 3.5C2.5 3.22 2.72 3 3 3H5.5L7 4.5H10.5C10.78 4.5 11 4.72 11 5V11.5C11 11.78 10.78 12 10.5 12H3C2.72 12 2.5 11.78 2.5 11.5V3.5Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9.5" cy="10.25" r="2.5" fill="#fafafa" stroke="none"/>
          <line x1="9.5" y1="9" x2="9.5" y2="11.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          <line x1="8" y1="10.25" x2="11" y2="10.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}

export default RootActions

