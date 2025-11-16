import PlaygroundSection from './playground-section'
import dedent from 'dedent'

const codeSample = {
  'index.js': dedent`\
  import { useState } from 'react'
  import Text from './text'
  import './styles.css'

  export default function App() {
    const [num, inc] = useState(1)
    const [darkMode, setDarkMode] = useState(false)
    const volume = num % 6
    
    return (
      <div className={\`root \${darkMode ? 'dark' : ''}\`}>
        <div className="theme-toggle">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={\`toggle-button \${darkMode ? 'dark' : ''}\`}
          >
            <span className={\`toggle-slider \${darkMode ? 'dark' : ''}\`} />
          </button>
        </div>
        <h2>
          hello <Text />
        </h2>
        <div className='volume-section'>
          <div className='volume-label'>Volume</div>
          <div className='volume-indicator'>
            {Array(5).fill(0).map((_, i) => (
              <div 
                key={i} 
                className={\`volume-bar \${i < volume ? 'active' : ''}\`}
              />
            ))}
          </div>
        </div>
        <button className='button' onClick={() => inc(num + 1)}>increase</button>
      </div>
    )
  }`,
  './text.js': dedent`\
  import React from 'react'

  export default function Text() {
    return <b>devjar</b>
  }`,
  './styles.css': dedent`\
  .root {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    transition: background-color 0.2s ease-in-out;
  }
  .root.dark {
    background-color: #111827;
  }
  .theme-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
  }
  .toggle-button {
    position: relative;
    width: 3.5rem;
    height: 1.75rem;
    border-radius: 9999px;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
    background-color: #e5e7eb;
    padding: 0;
  }
  .toggle-button.dark {
    background-color: #374151;
  }
  .toggle-slider {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 9999px;
    background-color: white;
    transition: transform 0.2s ease-in-out;
  }
  .toggle-slider.dark {
    transform: translateX(1.75rem);
  }
  h2 {
    color: rgba(51, 65, 85);
    font-weight: 300;
    font-size: 2rem;
    margin: 0;
  }
  .root.dark h2 {
    color: #f9fafb;
  }
  .title {
    color: rgba(51, 65, 85);
    font-weight: 300;
    transition: color 0.2s ease-in-out;
  }
  .title:hover {
    color: rgba(23, 119, 195, 0.8);
  }
  .volume-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 1rem;
  }
  .volume-label {
    font-size: 0.875rem;
    color: rgba(107, 114, 128, 1);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }
  .root.dark .volume-label {
    color: #9ca3af;
  }
  .volume-indicator {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }
  .volume-bar {
    width: 0.5rem;
    background: rgba(229, 231, 235, 1);
    border-radius: 0.125rem;
    transition: all 0.2s ease-in-out;
  }
  .root.dark .volume-bar {
    background: #4b5563;
  }
  .volume-bar:nth-child(1) {
    height: 1rem;
  }
  .volume-bar:nth-child(2) {
    height: 1.5rem;
  }
  .volume-bar:nth-child(3) {
    height: 2rem;
  }
  .volume-bar:nth-child(4) {
    height: 2.5rem;
  }
  .volume-bar:nth-child(5) {
    height: 3rem;
  }
  .volume-bar.active {
    background: rgba(51, 65, 85, 1);
  }
  .root.dark .volume-bar.active {
    background: #60a5fa;
  }
  .button {
    background: #fff;
    border: 1px solid rgba(51, 65, 85, 1);
    padding: 0.5rem 1.5rem;
    border-radius: 0.375rem;
    font-weight: 500;
    color: rgba(51, 65, 85, 1);
    cursor: pointer;
    transition: all 0.2s ease-in-out;
  }
  .root.dark .button {
    background: #374151;
    border-color: #6b7280;
    color: #f9fafb;
  }
  .button:hover {
    background: rgba(51, 65, 85, 1);
    color: #fff;
  }
  .root.dark .button:hover {
    background: #4b5563;
    color: #fff;
  }
  .button:active {
    transform: scale(0.98);
  }
  `,
}

export default function Page() {
  return (
    <PlaygroundSection 
      codeRuntimeFiles={codeSample}
    />
  )
}
