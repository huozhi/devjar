function source(parts: TemplateStringsArray) {
  const lines = parts[0].split('\n')
  const contentLines = lines.filter((line) => line.trim())
  const indentation = Math.min(
    ...contentLines.map((line) => line.match(/^ */)?.[0].length || 0),
  )

  return lines.map((line) => line.slice(indentation)).join('\n').trimEnd()
}

export const demoFiles = {
  'pages/index.jsx': source`\
  import Intro from '../components/intro'
  import Routes from '../components/routes'
  import '../styles.css'

  export default function Page() {
    return (
      <div className="page">
        <main>
          <Intro
            name="devjar"
            title="Prototype with React."
            description={
              'CDN dependencies while developing. ' +
              'Prerendered static pages when you build.'
            }
            action="Edit"
          />
          <Routes
            routes={[
              { file: '├── index.tsx', path: '/' },
              { file: '├── about.tsx', path: '/about' },
              {
                file: '└── docs/\\n    └── start.tsx',
                path: '/docs/start',
              },
            ]}
          />
        </main>
      </div>
    )
  }`,
  'components/intro.jsx': source`\
  export default function Intro({ name, title, description, action }) {
    function editDemo() {
      window.parent.postMessage('devjar:edit-demo', '*')
    }

    return (
      <section className="intro">
        <p className="eyebrow">{name}</p>
        <h1>{title}</h1>
        <p className="description">{description}</p>
        <p className="edit-prompt">
          <span className="edit-pointer" aria-hidden="true">→</span>
          <a
            href="#editor"
            onClick={(event) => {
              event.preventDefault()
              editDemo()
            }}
          >
            {action}
          </a>
          <span> this demo</span>
        </p>
      </section>
    )
  }`,
  'components/routes.jsx': source`\
  import { useEffect, useState } from 'react'

  const pixels = '░▒▓█▄▀■□▪▫'
  const lowPixels = '·.ˑ'

  function TerminalIcon() {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m2 4 4 4-4 4M8 12h6" />
      </svg>
    )
  }

  function BrowserIcon() {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
        <path d="M2 6h12" />
        <circle cx="4" cy="4.25" r=".5" />
      </svg>
    )
  }

  function transformCharacter(character, column, row, frame) {
    const wave = (frame % 48) - 8 + Math.sin(row * 1.35) * 2.4
    const distance = Math.abs(column - wave)
    if (distance > 2.2) return character

    if (character === ' ') {
      return lowPixels[(frame + column + row) % lowPixels.length]
    }
    return pixels[(frame * 7 + column * 3 + row * 11) % pixels.length]
  }

  export default function Routes({ routes }) {
    const [frame, setFrame] = useState(0)

    useEffect(() => {
      const timer = setInterval(() => {
        setFrame((current) => current + 1)
      }, 80)

      return () => clearInterval(timer)
    }, [])

    return (
      <section className="route-demo" aria-label="File routes">
        <div className="route-heading">
          <TerminalIcon />
          <BrowserIcon />
        </div>
        <div className="route-map">
          <code className="route-root">pages/</code>
          {routes.map((route, row) => (
            <div className="route-row" key={route.path}>
              <code className="route-source">
                {route.file.split('\\n').map((line, lineIndex) => (
                  <span className="route-source-line" key={line}>
                    {Array.from(line).map((character, column) => {
                      const transformed = transformCharacter(
                        character,
                        column,
                        row + lineIndex * 0.5,
                        frame,
                      )
                      return (
                        <span
                          className={transformed === character ? '' : 'pixel'}
                          key={column}
                        >
                          {transformed}
                        </span>
                      )
                    })}
                  </span>
                ))}
              </code>
              <span className="route-arrow" aria-hidden="true">→</span>
              <code className="browser-route" aria-label={route.path}>
                {Array.from(route.path).map((character, column) => {
                  const transformed = transformCharacter(
                    character,
                    column + 22,
                    row,
                    frame,
                  )
                  return (
                    <span
                      className={transformed === character ? '' : 'pixel'}
                      key={column}
                      aria-hidden="true"
                    >
                      {transformed}
                    </span>
                  )
                })}
              </code>
            </div>
          ))}
        </div>
      </section>
    )
  }`,
  'styles.css': source`\
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    color: #171717;
    background: #f7f7f7;
  }

  .page {
    min-height: 100vh;
    padding: 18px;
    background: #f7f7f7;
  }

  main {
    width: min(960px, 100%);
    min-height: calc(100vh - 36px);
    display: grid;
    grid-template-columns: minmax(0, 0.86fr) minmax(300px, 1.14fr);
    gap: 30px;
    align-items: center;
    margin: 0 auto;
  }

  .intro {
    max-width: 400px;
    min-width: 0;
  }

  .eyebrow {
    margin: 0 0 12px;
    color: #737373;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: #404040;
    font-size: clamp(1.75rem, 3.5vw, 2.75rem);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.02;
  }

  .description {
    max-width: 350px;
    margin: 18px 0 0;
    color: #57534e;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .edit-prompt {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 18px 0 0;
    color: #737373;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .edit-prompt a {
    color: #404040;
    background: linear-gradient(
      105deg,
      #404040 35%,
      #fafafa 48%,
      #404040 61%
    );
    background-clip: text;
    background-size: 250% 100%;
    color: transparent;
    font-weight: 700;
    text-decoration-color: #404040;
    text-underline-offset: 3px;
    animation: edit-shine 2.4s ease-in-out infinite;
  }

  .edit-pointer {
    color: #737373;
    animation: point-to-edit 1s ease-in-out infinite;
  }

  @keyframes point-to-edit {
    50% { transform: translateX(3px); }
  }

  @keyframes edit-shine {
    0%, 55% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  .route-demo {
    width: min(440px, 100%);
    justify-self: end;
    overflow: hidden;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    background: transparent;
  }

  .route-heading {
    min-height: 42px;
    display: grid;
    grid-template-columns: 180px 10px max-content;
    align-items: center;
    justify-content: start;
    gap: 5px;
    padding: 14px 24px 0;
    color: #737373;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .route-heading svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .route-heading svg:last-child {
    grid-column: 3;
    justify-self: start;
  }

  .route-heading circle {
    fill: currentColor;
    stroke: none;
  }

  .route-map {
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12px 24px 18px;
    overflow: hidden;
    color: #737373;
    font-family: SFMono-Regular, Consolas, 'Liberation Mono',
      Menlo, monospace;
    font-size: clamp(0.72rem, 1.65vw, 0.95rem);
    font-weight: 500;
    line-height: 1.65;
  }

  .route-root {
    display: block;
    margin-bottom: 4px;
    color: #404040;
    font-weight: 700;
  }

  .route-row {
    display: grid;
    grid-template-columns: 180px 10px max-content;
    align-items: end;
    justify-content: start;
    gap: 5px;
  }

  .route-source {
    min-width: 0;
    color: #737373;
    font: inherit;
  }

  .route-source-line {
    display: block;
    white-space: pre;
  }

  .route-source-line > span {
    display: inline-block;
    width: 1ch;
    text-align: center;
  }

  .route-arrow {
    color: #a3a3a3;
  }

  .browser-route {
    min-width: 0;
    color: #57534e;
    font: inherit;
    white-space: nowrap;
  }

  .browser-route > span {
    display: inline-block;
    width: 1ch;
    text-align: center;
  }

  @media (max-width: 760px) {
    .page {
      min-height: 100vh;
      padding: 16px;
    }

    main {
      min-height: auto;
      grid-template-columns: 1fr;
      gap: 28px;
    }

    .intro {
      padding-top: 12px;
    }

    .route-map {
      min-height: 115px;
      padding: 10px 16px 16px;
      font-size: clamp(0.67rem, 3.1vw, 0.85rem);
    }

    .route-heading {
      padding: 14px 16px 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }

    .edit-prompt a {
      background: none;
      color: #404040;
    }
  }
  `,
}
