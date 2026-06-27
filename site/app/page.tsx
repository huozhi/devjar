import PlaygroundSection from './playground-section'
import dedent from 'dedent'

const codeSample = {
  'index.js': dedent`\
  import { useState } from 'react'
  import { art } from './ascii'
  import './styles.css'

  const site = {
    name: 'DEVJAR',
    cta: 'WIGGLE',
    accent: '#525252',
  }

  export default function App() {
    const [refreshes, setRefreshes] = useState(0)

    return (
      <div className="page" style={{ '--accent': site.accent }}>
        <main>
          <section className="copy">
            <h1>{site.name}</h1>
            <p className="eyebrow">React Live Preview in browser</p>
            <button type="button" onClick={() => setRefreshes((count) => count + 1)}>
              {site.cta}
            </button>
          </section>

          <pre className={refreshes > 0 ? 'ascii is-shuffling' : 'ascii'} aria-label="Devjar preview">
            <code key={refreshes}>
              {art.map((line, index) => (
                <span className="ascii-line" key={index}>{line}</span>
              ))}
            </code>
          </pre>
        </main>
      </div>
    )
  }`,
  './ascii.js': dedent`\
  const copy = {
    title: 'DEVJAR',
    editorLabel: 'editor',
    previewLabel: 'preview',
    filename: 'index.js',
    codeLine: 'const title = "Ship"',
    renderLine: 'return <Demo />',
    resultLabel: 'live result',
    actionLabel: '[ Button ]',
  }

  function fit(value, width) {
    return String(value).slice(0, width)
  }

  function left(value, width) {
    return fit(value, width).padEnd(width, ' ')
  }

  function center(value, width) {
    const text = fit(value, width)
    const before = Math.floor((width - text.length) / 2)
    const after = width - text.length - before
    return ' '.repeat(before) + text + ' '.repeat(after)
  }

  function codeLine(value) {
    return '|  ' + left(value, 22) + '|  | '
  }

  function previewLine(value) {
    return '|  |' + center(value, 18) + '|  |  | '
  }

  const art = [
    center(copy.title, 30),
    '  .------------------------.  ',
    ' /  ' + left(copy.editorLabel, 6) + '        ' + left(copy.previewLabel, 7) + '  /| ',
    '+------------------------+  | ',
    '| ' + left(copy.filename, 23) + '|  | ',
    '|                        |  | ',
    codeLine(copy.codeLine),
    codeLine(copy.renderLine),
    '|                        |  | ',
    '|  .------------------.  |  | ',
    previewLine(copy.resultLabel),
    previewLine(copy.actionLabel),
    '|  |                  |  |  | ',
    '|  +------------------+  | /  ',
    '+------------------------+    ',
  ]

  export { art }`,
  './styles.css': dedent`\
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    color: #171717;
    background: #f7f7f7;
    overflow-x: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 18px;
    overflow-x: hidden;
    background: #f7f7f7;
  }

  main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(240px, 1.18fr);
    gap: 20px;
    align-items: center;
  }

  .copy {
    max-width: 360px;
    min-width: 0;
  }

  .eyebrow {
    margin: 0;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0 0 10px;
    font-size: clamp(2.25rem, 7vw, 4.25rem);
    font-weight: 700;
    line-height: 0.92;
  }

  p {
    margin: 0;
    color: #57534e;
    font-size: 0.95rem;
    line-height: 1.45;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 18px;
    border: 1px solid #d4d4d4;
    border-radius: 999px;
    padding: 10px 16px;
    background: #ffffff;
    color: #171717;
    font: inherit;
    font-weight: 700;
    line-height: 1.25;
    height: calc(1.25em + 22px);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  button:hover,
  button:focus-visible {
    border-color: #a3a3a3;
    background: #f5f5f5;
  }

  button:active {
    border-color: #a3a3a3;
    background: #eeeeee;
  }

  .ascii {
    margin: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    background: #fbfbfb;
    color: #404040;
    overflow: hidden;
  }

  .ascii code {
    display: block;
    max-width: 100%;
    max-height: 100%;
    font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: clamp(0.72rem, 1.45vw, 1rem);
    font-weight: 400;
    line-height: 1.34;
    letter-spacing: 0;
    white-space: pre;
    tab-size: 2;
    text-align: left;
    font-variant-ligatures: none;
    overflow: visible;
  }

  .ascii-line {
    display: block;
    white-space: pre;
    font: inherit;
  }

  .ascii.is-shuffling .ascii-line:nth-child(7),
  .ascii.is-shuffling .ascii-line:nth-child(8),
  .ascii.is-shuffling .ascii-line:nth-child(11),
  .ascii.is-shuffling .ascii-line:nth-child(12) {
    animation: shuffle-line 0.58s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform, opacity;
  }

  .ascii.is-shuffling .ascii-line:nth-child(8),
  .ascii.is-shuffling .ascii-line:nth-child(12) {
    animation-delay: 0.06s;
  }

  @keyframes shuffle-line {
    0% {
      opacity: 1;
      transform: translateX(0);
    }

    22% {
      opacity: 0.58;
      transform: translateX(1ch);
    }

    44% {
      opacity: 0.86;
      transform: translateX(-0.72ch);
    }

    66% {
      opacity: 0.7;
      transform: translateX(0.38ch);
    }

    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .ascii::selection,
  .ascii code::selection {
    background: #e5e5e5;
    color: #171717;
  }

  @media (max-width: 760px) {
    .page {
      min-height: 100vh;
      height: auto;
      overflow: auto;
      padding: 16px;
    }

    main {
      grid-template-columns: 1fr;
      gap: 18px;
    }

    .ascii {
      height: auto;
      min-height: 220px;
    }

    .ascii code {
      font-size: clamp(0.68rem, 2.85vw, 0.9rem);
    }
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
