export function source(parts: TemplateStringsArray) {
  const lines = parts[0].split('\n')
  const contentLines = lines.filter((line) => line.trim())
  const indentation = Math.min(
    ...contentLines.map((line) => line.match(/^ */)?.[0].length || 0),
  )

  return lines.map((line) => line.slice(indentation)).join('\n').trimEnd()
}

export const demoContentPresets = [
  {
    name: 'devjar',
    tagline: 'Make an idea real. Change it live.',
    category: 'Features',
    title: 'Your next idea, already live.',
    description: 'Write React pages, edit their content, and see your changes in the preview. Start with an idea and keep going.',
    about: 'Devjar is a zero-config React static site builder. Create pages with React and TypeScript, share components between routes, and build a static site from the same files.',
    entries: [
      { title: 'See changes as you make them', category: 'Live updates', step: '01' },
      { title: 'One file. Another page.', category: 'File-based routing', step: '02' },
      { title: 'Build a site you can take anywhere', category: 'Static output', step: '03' },
    ],
  },
  {
    name: 'devjar',
    tagline: 'A few files. A working website.',
    category: 'Getting started',
    title: 'Start small. Make it yours.',
    description: 'Create pages/index.tsx with a default React component, then run npx devjar dev. Your first page is ready to work on.',
    about: 'Add pages/about.tsx for an About page. Import shared components and CSS into your pages. Edit the files while the dev server runs to see your site update live.',
    entries: [
      { title: 'Create pages/index.tsx', category: 'Write a page', step: '01' },
      { title: 'Run npx devjar dev', category: 'Start developing', step: '02' },
      { title: 'Edit, preview, repeat', category: 'Make it yours', step: '03' },
    ],
  },
  {
    name: 'devjar',
    tagline: 'From local preview to the open web.',
    category: 'Build & share',
    title: 'Made locally. Ready to share.',
    description: 'Preview on your phone, build your static site, and check the result locally before you publish.',
    about: 'Run npx devjar dev --host 0.0.0.0 and open the network URL on a phone connected to the same network. Run npx devjar build to generate dist, then npx devjar start to preview the build. Publish dist to a static host.',
    entries: [
      { title: 'dev --host 0.0.0.0', category: 'Phone preview · npx devjar', step: '01' },
      { title: 'npx devjar build', category: 'Generate your site', step: '02' },
      { title: 'npx devjar start', category: 'Preview the build', step: '03' },
    ],
  },
]

export function demoContentModule(content: typeof demoContentPresets[number]) {
  return `export default ${JSON.stringify(content, null, 2)}\n`
}

export const demoFiles = {
  'content.ts': demoContentModule(demoContentPresets[0]),
  'pages/index.tsx': source`\
  import Layout from '../components/layout'
  import content from '../content'

  export default function Page() {
    return <Layout current="/">
      <main className="stories theme-content" key={content.title}>
        <article className="featured">
          <p className="eyebrow">Explore Devjar <span>— {content.category}</span></p>
          <h1>{content.title}</h1>
          <p className="description">{content.description}</p>
          <a className="read-story" href="/story">Learn more</a>
        </article>
        <section className="latest" aria-label="Features and usage">
          <p className="eyebrow">At a glance <span> / 03</span></p>
          {content.entries.map(entry => <article className="entry" key={entry.title}>
            <div className="entry-meta"><span>{entry.category}</span><span>{entry.step}</span></div>
            <h2>{entry.title}</h2>
          </article>)}
        </section>
      </main>
    </Layout>
  }
  `,
  'pages/about.tsx': source`\
  import Layout from '../components/layout'
  import content from '../content'

  export default function About() {
    return <Layout current="/about">
      <main className="page-copy theme-content" key={content.title}>
        <h1 className="eyebrow">About Devjar</h1>
        <p>{content.about}</p>
        <a href="/">Explore the demo</a>
      </main>
    </Layout>
  }
  `,
  'pages/story.tsx': source`\
  import Layout from '../components/layout'
  import content from '../content'

  export default function Story() {
    return <Layout current="/story">
      <main className="page-copy theme-content" key={content.title}>
        <p className="eyebrow">{content.category}</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        <p>{content.about}</p>
        <a href="/">Back to the demo</a>
      </main>
    </Layout>
  }
  `,
  'components/layout.tsx': source`\
  import content from '../content'
  import '../styles.css'

  export default function Layout({ current, children }) {
    function changeContent() {
      window.parent.postMessage('devjar:change-content', '*')
    }

    return <div className="page">
      <div className="theme-toolbar">
        <span>EDITORIAL <span className="toolbar-detail">/ a living theme</span></span>
        <button type="button" onClick={changeContent}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h3c4 0 8 10 12 10h3M17 13l4 4-4 4M3 17h3c1.5 0 3-1.4 4.5-3.3M14 9.8C15.4 8.2 16.7 7 18 7h3M17 3l4 4-4 4" />
          </svg>
          I'm feeling lucky
        </button>
      </div>
      <header>
        <div className="masthead theme-content" key={content.title}>
          <a className="publication" href="/">{content.name}</a>
          <p>{content.tagline}</p>
        </div>
        <nav aria-label="Demo pages">
          <a href="/" aria-current={current === '/' ? 'page' : undefined}>Home</a>
          <a href="/about" aria-current={current === '/about' ? 'page' : undefined}>About</a>
        </nav>
      </header>
      {children}
    </div>
  }
  `,
  'styles.css': source`\
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #f7f7f7; color: #404040; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .page { max-width: 1000px; margin: 0 auto; padding: 0 24px 24px; }
  a { color: inherit; text-underline-offset: 4px; }
  a:focus-visible, button:focus-visible { outline: 2px solid #737373; outline-offset: 4px; }
  .theme-toolbar { height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #dedede; }
  .theme-toolbar > span { font-size: 9px; letter-spacing: 0.1em; color: #737373; }
  .toolbar-detail { letter-spacing: 0; text-transform: none; color: #999; }
  button { flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px; border: 0; border-radius: 5px; background: #eaeaea; color: #404040; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 160ms ease, color 160ms ease; }
  button svg { transition: transform 160ms ease; }
  button:hover { background: #dedede; color: #171717; }
  button:hover svg { transform: rotate(-12deg); }
  button:active { background: #dedede; }
  header { height: 112px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid #bdbdbd; }
  .publication { font-family: Georgia, serif; font-size: clamp(25px, 4vw, 38px); letter-spacing: -0.055em; text-decoration: none; }
  .masthead p { margin: 8px 0 0; color: #858585; font-size: 10px; }
  nav { display: flex; gap: 18px; font-size: 11px; }
  nav a { padding: 5px 0; text-decoration: none; color: #737373; }
  nav a[aria-current] { border-bottom: 1px solid #737373; color: #404040; }
  main { height: 290px; overflow: auto; }
  .stories { display: grid; align-content: start; grid-template-columns: 1.15fr 1fr; gap: 30px; padding-top: 26px; }
  .eyebrow { margin: 0 0 16px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: #737373; }
  .eyebrow span { color: #999; }
  h1 { margin: 0; font-family: Georgia, serif; font-weight: 400; font-size: clamp(28px, 4vw, 42px); line-height: 1.08; letter-spacing: -0.035em; }
  .featured h1 { min-height: 2.16em; max-width: 360px; }
  .description { max-width: 360px; min-height: 4.8em; margin: 16px 0; font-size: 12px; line-height: 1.6; color: #737373; }
  .read-story, .page-copy > a { font-size: 11px; color: #526b8a; }
  .latest { border-left: 1px solid #dedede; padding-left: 26px; }
  .latest > .eyebrow { margin-bottom: 4px; }
  .entry { min-height: 72px; padding: 14px 0; border-bottom: 1px solid #e2e2e2; }
  .entry:last-child { border-bottom: 0; }
  .entry-meta { display: flex; justify-content: space-between; gap: 12px; color: #858585; font-size: 9px; }
  .entry-meta > span { color: #526b8a; }
  .entry h2 { margin: 8px 0 0; font-family: Georgia, serif; font-size: 17px; line-height: 1.2; font-weight: 400; letter-spacing: -0.02em; }
  .page-copy { max-width: 580px; padding-top: 26px; }
  .page-copy > p:not(.eyebrow) { font-size: 13px; line-height: 1.7; color: #737373; }
  .theme-content { animation: content-reveal 240ms ease-out; }
  @keyframes content-reveal { from { opacity: 0.35; } to { opacity: 1; } }
  @media (max-width: 560px) {
    .page { padding: 0 16px 20px; }
    .toolbar-detail { display: none; }
    header { height: 108px; gap: 12px; }
    .masthead p { max-width: 190px; line-height: 1.5; min-height: 30px; }
    nav { gap: 12px; }
    main { height: 540px; }
    .stories { grid-template-columns: 1fr; gap: 24px; padding-top: 22px; }
    .featured h1 { max-width: 300px; }
    .description { min-height: 0; }
    .latest { border-left: 0; border-top: 1px solid #dedede; padding: 20px 0 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .theme-content { animation: none; }
    button, button svg { transition: none; }
    button:hover svg { transform: none; }
  }
  `,
}
