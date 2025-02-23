import { Codesandbox } from '../ui/codesandbox'

const codeSampleCssImport = {
  'index.js': `\
  import { useState } from 'react'
  import Text from './text'
  import './styles.css'

  export default function App() {
    const [num, inc] = useState(1)
    
    return (
      <div className='container'>
        <h2>
          hello <Text />
        </h2>

        <p>Volume {Array(num % 6).fill('●').join('')}</p>
        <button className='button' onClick={() => inc(num + 1)}>increase</button>
      </div>
    )
  }`,
  './text.js': `\
  import React from 'react'

  export default function Text() {
    return <b>devjar</b>
  }`,
  './styles.css': `\
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
  }
  h2 {
    color: rgba(51, 65, 85);
    font-weight: 300;
    font-size: 2rem;
  }
  .title {
    color: rgba(51, 65, 85);
    font-weight: 300;
    transition: color 0.2s ease-in-out;
  }
  .title:hover {
    color: rgba(23, 119, 195, 0.8);
  }

  .button {
    background: #eee;
    border: 1px solid #222;
    padding: 8px 16px;
    border-radius: 4px;
    font-weight: 700;
    transition: color 0.2s ease-in-out;
  }
  .button:hover {
    background: #ddd;
    color: #222;
  }
  .button:active {
    background: #ccc;
    color: #222;
  }
  `,
}

const codeSampleTheme = {
  'index.js': `\
import React, { useState } from 'react'

function App() {
  const [darkMode, setDarkMode] = useState(false)

  return (
    <div
      className={\`flex flex-col items-center justify-center min-h-screen $\{
        darkMode ? 'bg-gray-800 text-white' : 'bg-white text-black'
      }\`}
    >
      <h1 className="text-2xl font-semibold mb-4">{darkMode ? 'Dark Mode' : 'Light Mode'}</h1>
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
      >
        Toggle {darkMode ? 'Light' : 'Dark'} Mode
      </button>
    </div>
  )
}

export default App

`,
}

const codeSamplePlayground = {
  'index.js': `\
export default function App() {
  return "type your code here..."
}
`,
}

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

      <div className="playground section">
        <h1>Playground</h1>
        <Codesandbox files={codeSamplePlayground} />
      </div>

      <div className='showcase'>
        <h1>Showcase</h1>
        <div className="codesandboxes section">
          <div>
            <h2>Tailwind CSS</h2>
            <Codesandbox files={codeSampleTheme} />
          </div>
          <div>
            <h2>Plain CSS</h2>
            <Codesandbox files={codeSampleCssImport} />
          </div>
        </div>
      </div>
    </main>
  )
}
