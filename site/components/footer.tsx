import { GitHubLink } from './github-link'

export function Footer() {
  return (
      <footer className="page-footer">
        <nav className="site-footer" aria-label="Footer links">
          <div className="footer-links">
            <a href="/">Examples</a>
            <a href="/docs">Docs</a>
            <a href="/llms.txt">Agent reference</a>
          </div>
          <div className="footer-social">
            <GitHubLink />
            <a href="https://x.com/huozhi" target="_blank" rel="noopener noreferrer" aria-label="X" title="X">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-7.4L5.6 22H2.47l7.99-9.14L.8 2h6.4l4.42 6.76L18.9 2Zm-1.1 18h1.73L6.26 3.9H4.4L17.8 20Z" /></svg>
            </a>
          </div>
        </nav>
      </footer>
  )
}
