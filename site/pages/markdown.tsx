import { useState } from 'react'
import '../styles.css'
import '../markdown-demo.css'

const themes = [
  { id: 'paper', name: 'Paper', kind: 'The research paper', description: 'A centered title, quiet serif type, and a compact scholarly rhythm.', sample: 'A study of light', color: '#315f88' },
  { id: 'academic', name: 'Academic', kind: 'The working journal', description: 'A contents list, clearly divided sections, and a restrained green accent.', sample: 'Observe. Record. Repeat.', color: '#256058' },
  { id: 'lecture', name: 'Lecture', kind: 'The classroom handout', description: 'Clear sans-serif type, generous headings, and blue-tinted callouts.', sample: 'Start with a question.', color: '#365fc6' },
  { id: 'book', name: 'Book', kind: 'The bound collection', description: 'Warm paper, larger serif text, and italic section headings with room to breathe.', sample: 'The art of noticing', color: '#735331' },
] as const

export default function MarkdownDemo() {
  const [selected, setSelected] = useState(0)
  const theme = themes[selected]
  return <>
    <title>Markdown themes — Devjar</title>
    <meta name="description" content="One Markdown article, four reading themes. Explore paper, academic, lecture, and book layouts." />
    <main className="markdown-demo">
      <nav className="markdown-demo-nav" aria-label="Page navigation">
        <a className="markdown-demo-home" href="/">devjar</a>
        <a href="/docs">Documentation ↗</a>
      </nav>
      <header className="markdown-demo-heading">
        <span className="markdown-demo-eyebrow">Made for reading</span>
        <h1>One story.<br />Four ways to read it.</h1>
        <p>Turn a Markdown file into a page that feels considered. Choose the rhythm that suits your words.</p>
      </header>
      <div className="markdown-theme-options" role="group" aria-label="Reading theme">
        {themes.map((item, index) => <button key={item.id} className={`markdown-theme-option theme-${item.id}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>
          <span className="markdown-theme-label"><span>{item.name}</span><span className="markdown-theme-dot" style={{ background: item.color }} /></span>
          <span className="markdown-theme-sample">{item.sample}</span>
          <span className="markdown-theme-kind">{item.kind}</span>
        </button>)}
      </div>
      <section className="markdown-demo-preview" aria-label={`${theme.name} theme preview`}>
        <div className="markdown-preview-toolbar">
          <div><strong>{theme.name}</strong><span>{theme.description}</span></div>
          <a href={`/markdown-previews/${theme.id}/`} target="_blank" rel="noopener noreferrer">Open page ↗</a>
        </div>
        <iframe key={theme.id} title={`${theme.name} Markdown page`} src={`/markdown-previews/${theme.id}/`} />
      </section>
      <div className="markdown-demo-caption">
        <p>The same Markdown, a different reading experience.</p>
        <code>npx devjar build --theme {theme.id}</code>
      </div>
      <section className="markdown-demo-customize">
        <div><span className="markdown-demo-eyebrow">Make it yours</span><h2>A starting point for your own style.</h2><p>Change a color, choose a font, or reshape the page with a simple <code>markdown.css</code> file.</p></div>
        <pre><code>{`:root {\n  --md-accent: #8c3e40;\n  --md-content-width: 72ch;\n  --md-font-body: Georgia, serif;\n}`}</code></pre>
      </section>
    </main>
  </>
}
