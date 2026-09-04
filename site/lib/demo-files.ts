export function source(parts: TemplateStringsArray) {
  const lines = parts[0].split('\n')
  const contentLines = lines.filter((line) => line.trim())
  const indentation = Math.min(
    ...contentLines.map((line) => line.match(/^ */)?.[0].length || 0),
  )

  return lines.map((line) => line.slice(indentation)).join('\n').trimEnd()
}

export const demoFiles = {
  'pages/index.tsx': source`\
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
  'components/intro.tsx': source`\
  export default function Intro({ name, title, description, action }) {
    function editDemo() {
      window.parent.postMessage('devjar:edit-demo', '*')
    }

    const [firstWord, ...rest] = title.split(' ')

    return (
      <section className="intro">
        <p className="eyebrow">{name}</p>
        <h1>
          <span className="title-word">
            {Array.from(firstWord).map((character, index) => (
              <span
                className={index % 3 === 2 ? 'title-glitch' : undefined}
                key={index}
              >
                {character}
              </span>
            ))}
          </span>{' '}
          {rest.join(' ')}
        </h1>
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
            <span className="edit-action">{action}</span>
            <span>this demo</span>
          </a>
        </p>
      </section>
    )
  }`,
  'components/routes.tsx': source`\
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

  export default function Routes({ routes }) {
    return (
      <section className="route-demo" aria-label="File routes">
        <div className="route-heading">
          <TerminalIcon />
          <BrowserIcon />
        </div>
        <div className="route-map">
          <code className="route-root">pages/</code>
          {routes.map((route) => (
            <div className="route-row" key={route.path}>
              <code className="route-source">
                {route.file.split('\\n').map((line) => (
                  <span className="route-source-line" key={line}>
                    {line}
                  </span>
                ))}
              </code>
              <span className="route-arrow" aria-hidden="true">→</span>
              <code className="browser-route">{route.path}</code>
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

  .title-word,
  .title-glitch {
    display: inline-block;
  }

  .title-glitch {
    animation: title-glitch 480ms steps(2, end) 240ms 1;
  }

  .title-glitch:nth-child(6) {
    animation-delay: 320ms;
  }

  .title-glitch:nth-child(9) {
    animation-delay: 400ms;
  }

  @keyframes title-glitch {
    0%, 18%, 52%, 100% {
      transform: translate(0);
      text-shadow: none;
    }
    20% {
      transform: translate(-1px, 1px);
      text-shadow: 2px 0 #d6d3d1;
    }
    36% {
      transform: translate(1px, -1px);
      text-shadow: -2px 0 #a8a29e;
    }
    50% {
      transform: translate(-0.5px, 0);
      text-shadow: 1px 0 #d6d3d1;
    }
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
    position: relative;
    display: inline-flex;
    align-items: baseline;
    gap: 0.25em;
    color: #737373;
    text-decoration: none;
  }

  .edit-prompt a::after {
    position: absolute;
    right: 0;
    bottom: 3px;
    left: 0;
    height: 1px;
    background: #737373;
    content: '';
    transform: scaleX(0);
    transform-origin: center;
    animation: edit-underline 420ms ease-out 950ms 1 forwards;
  }

  .edit-action {
    color: #404040;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .edit-pointer {
    position: relative;
    top: 2px;
    color: #737373;
    font-size: 1.1rem;
    animation: point-to-edit 1s ease-in-out infinite;
  }

  @keyframes point-to-edit {
    50% { transform: translateX(3px); }
  }

  @keyframes edit-underline {
    to { transform: scaleX(1); }
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
    grid-column: 2;
    justify-self: center;
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

  .route-arrow {
    color: #a3a3a3;
  }

  .browser-route {
    min-width: 0;
    color: #57534e;
    font: inherit;
    white-space: nowrap;
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
      animation-delay: 0ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  `,
}
