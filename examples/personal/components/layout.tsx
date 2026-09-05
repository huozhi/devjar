import type { ReactNode } from 'react'
import content from '../content.json'
import '../styles.css'

export function Layout({ page, children }: { page: string; children: ReactNode }) {
  return (
    <div className="site">
      <title>{page === 'Home' ? content.name : `${page} — ${content.name}`}</title>
      <meta name="description" content={content.intro} />
      {children}
      <footer className="site-footer"><span>{content.name}</span><a href="/playground">Edit this résumé</a></footer>
    </div>
  )
}
