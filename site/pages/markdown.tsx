import { GitHubLink } from '../components/github-link'
import '../styles.css'
import '../markdown-demo.css'

const themes = [
  { id: 'minimal', name: 'Minimal', description: 'Oversized, light headings and an uncluttered reading column. For personal pages and short announcements.' },
  { id: 'github', name: 'GitHub', description: 'Compact sections, crisp tables, and easy-to-scan code blocks. A familiar README style for project documentation.' },
  { id: 'editorial', name: 'Editorial', description: 'Warm paper and expressive serif type for stories, essays, and slower reading.' },
  { id: 'academic', name: 'Academic', description: 'A centered title, restrained serif type, and compact sections for clear research notes.' },
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
          <h2 id={`theme-${theme.id}`}>{theme.name}</h2>
          <p>{theme.description}</p>
        </div>
      </section>)}</div>
    </main>
  </>
}
