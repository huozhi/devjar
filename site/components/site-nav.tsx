import { GitHubLink } from './github-link'

export function SiteNav({ active }: { active: 'docs' | undefined }) {
  return <nav className="site-nav" aria-label="Page navigation">
    <a href="/docs" aria-current={active === 'docs' ? 'page' : undefined}>Docs</a>
    <GitHubLink />
  </nav>
}
