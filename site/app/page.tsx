import PlaygroundSection from './playground-section'
import dedent from 'dedent'

const codeSampleCssImport = {
  'index.js': dedent`\
  import { useState } from 'react'
  import Text from './text'
  import './styles.css'

  export default function App() {
    const [num, inc] = useState(1)
    const volume = num % 6
    
    return (
      <div className='root'>
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
  }
  h2 {
    color: rgba(51, 65, 85);
    font-weight: 300;
    font-size: 2rem;
    margin: 0;
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
  .button:hover {
    background: rgba(51, 65, 85, 1);
    color: #fff;
  }
  .button:active {
    transform: scale(0.98);
  }
  `,
}

const codeSampleTheme = {
  'index.js': dedent`\
import React, { useState } from 'react'

function App() {
  const [darkMode, setDarkMode] = useState(false)

  return (
    <div
      className={\`min-h-screen flex items-center justify-center
        transition-colors duration-200 $\{
        darkMode ? 'bg-gray-900' : 'bg-white'
      }\`}
    >
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={\`relative w-14 h-7 rounded-full
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2 $\{
          darkMode 
            ? 'bg-gray-700 focus:ring-gray-500' 
            : 'bg-gray-200 focus:ring-gray-400'
        }\`}
      >
        <span
          className={\`absolute top-0.5 left-0.5 w-6 h-6 rounded-full
            transition-transform duration-200 $\{
            darkMode ? 'translate-x-7 bg-white' : 'translate-x-0 bg-white'
          }\`}
        />
      </button>
    </div>
  )
}

export default App

`,
}

const examples = [
  { id: 'plain-css', name: 'Plain CSS', files: codeSampleCssImport },
  { id: 'tailwind', name: 'Tailwind CSS', files: codeSampleTheme },
]

export default function Page() {
  return (
    <main>
      <div className="titles">
        <h1>Devjar</h1>
        <h3>Live React Component Previews in Browser</h3>
        <p>
          Devjar empowers you create interactive, real-time React code preview easier. Builtin <b>Tailwind</b> and{' '}
          <b>CSS imports</b> for styling, creating demos that are stylish and eye-catching.
        </p>
        <br />

        <p>
          <a href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer">
            Source Code & Usage ↗
          </a>
        </p>
      </div>

      <PlaygroundSection examples={examples} />
    </main>
  )
}
