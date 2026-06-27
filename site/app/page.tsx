import PlaygroundSection from './playground-section'
import dedent from 'dedent'

const codeSample = {
  'index.js': dedent`\
  import { useState } from 'react'
  import './styles.css'

  export default function App() {
    const [count, setCount] = useState(0)

    return (
      <div className="app">
        <div className="counter">
          <p className="eyebrow">React preview</p>
          <h1>Counter</h1>
          <p className="count">{count}</p>
          <button onClick={() => setCount(count + 1)}>
            Add one
          </button>
        </div>
      </div>
    )
  }`,
  './styles.css': dedent`\
  .app {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f8fafc;
    color: #0f172a;
  }

  .counter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: min(22rem, calc(100vw - 2rem));
    padding: 2rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: 0 1rem 3rem rgba(15, 23, 42, 0.08);
  }

  .eyebrow {
    margin: 0;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 2.25rem;
    line-height: 1;
  }

  .count {
    margin: 0;
    font-size: 4rem;
    line-height: 1;
    font-weight: 800;
    color: #2563eb;
  }

  button {
    border: 0;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    background: #0f172a;
    color: white;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease;
  }

  button:hover {
    background: #1d4ed8;
  }

  button:active {
    transform: translateY(1px);
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
