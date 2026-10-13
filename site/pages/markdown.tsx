import { GitHubLink } from '../components/github-link'
import '../styles.css'
import '../markdown-demo.css'

const themes = [
  { id: 'studio', name: 'Studio', kind: 'A quieter workspace', description: 'Clean sans-serif type, clear hierarchy, and generous space. A natural fit for product notes and small websites.', detail: 'Neutral colors · Spacious headings · Simple callouts' },
  { id: 'primer', name: 'Primer', kind: 'Familiar from the first line', description: 'The rhythm of a good README: compact sections, crisp tables, and code that is easy to scan. Made for project documentation.', detail: 'Section dividers · Code blocks · Structured tables' },
  { id: 'editorial', name: 'Editorial', kind: 'Give the words some room', description: 'Warm paper, expressive serif type, and a relaxed reading pace. For stories, essays, and things worth lingering over.', detail: 'Large serif type · Warm colors · Italic headings' },
  { id: 'academic', name: 'Academic', kind: 'A thoughtful page', description: 'A centered title, restrained serif type, and compact sections give research notes the structure of a clear, readable paper.', detail: 'Centered titles · System serif fonts · Compact sections' },
] as const

export default function MarkdownDemo() {
  return <>
    <title>Markdown themes — Devjar</title>
    <meta name="description" content="Four Markdown reading styles for product notes, project documentation, essays, and scholarly research notes." />
    <main className="markdown-demo">
      <nav className="intro-links" aria-label="Page navigation">
        <a className="intro-docs" href="/">Home</a>
        <a className="intro-docs" href="/docs">Docs</a>
        <GitHubLink />
      </nav>
      <div className="markdown-fragments">{themes.map(theme => <section key={theme.id} className="markdown-example" aria-labelledby={`theme-${theme.id}`}>
        <iframe className="markdown-fragment-preview" title={`${theme.name} page fragment`} src={`/markdown-previews/${theme.id}/`} />
        <div className="markdown-fragment-intro">
          <span className="markdown-fragment-kind">{theme.kind}</span>
          <h2 id={`theme-${theme.id}`}>{theme.name}</h2>
          <p>{theme.description}</p>
          <span className="markdown-fragment-detail">{theme.detail}</span>
        </div>
      </section>)}</div>
    </main>
  </>
}
