import { useEffect, useRef } from 'react'
import '../styles.css'
import '../markdown-demo.css'

const themes = [
  { id: 'paper', name: 'Paper', kind: 'Research paper' },
  { id: 'academic', name: 'Academic', kind: 'Research notebook' },
  { id: 'lecture', name: 'Lecture', kind: 'Classroom handout' },
  { id: 'book', name: 'Book', kind: 'Collected essays' },
] as const

function PageFragment({ theme }: { theme: typeof themes[number] }) {
  const observer = useRef<ResizeObserver | undefined>(undefined)
  useEffect(() => () => observer.current?.disconnect(), [])
  return <section className="markdown-fragment" aria-label={`${theme.name} theme`}>
    <div className="markdown-fragment-label"><span>{theme.name}</span><span>{theme.kind}</span></div>
    <iframe title={`${theme.name} page fragment`} src={`/markdown-previews/${theme.id}/`} scrolling="no" onLoad={event => {
      const frame = event.currentTarget
      const body = frame.contentDocument?.body
      if (!body) return
      observer.current?.disconnect()
      const resize = () => { frame.style.height = `${Math.ceil(body.getBoundingClientRect().height)}px` }
      observer.current = new ResizeObserver(resize)
      observer.current.observe(body)
      resize()
    }} />
  </section>
}

export default function MarkdownDemo() {
  return <>
    <title>Markdown themes — Devjar</title>
    <meta name="description" content="Four Markdown reading styles for research papers, academic notes, classroom handouts, and collected essays." />
    <main className="markdown-demo">
      <nav className="intro-links" aria-label="Page navigation">
        <a className="intro-docs" href="/">Home</a>
        <a className="intro-docs" href="/docs">Docs</a>
        <a className="intro-docs" href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </nav>
      <div className="markdown-fragments">{themes.map(theme => <PageFragment key={theme.id} theme={theme} />)}</div>
    </main>
  </>
}
