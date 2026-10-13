import { GitHubLink } from './github-link'

export function SiteNav({ active }: { active: 'markdown' | 'docs' | undefined }) {
  return <nav className="site-nav" aria-label="Page navigation">
    <a href="/markdown" aria-current={active === 'markdown' ? 'page' : undefined}>Markdown</a>
    <a href="/docs" aria-current={active === 'docs' ? 'page' : undefined}>Docs</a>
    <GitHubLink />
  </nav>
}
