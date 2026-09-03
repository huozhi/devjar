import { Codesandbox } from '../components/codesandbox'
import { demoFiles } from '../lib/demo-files'
import '../styles.css'

export default function Page() {
  return (
    <>
      <main>
        <div className="playground-container">
          <div className="playground-wrapper">
            <Codesandbox files={demoFiles} />
          </div>
        </div>
      </main>
      <footer>
        <nav className="site-footer" aria-label="Footer links">
          <div className="footer-links">
            <a href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="https://github.com/huozhi/devjar/blob/main/API.md" target="_blank" rel="noopener noreferrer">
              API.md
            </a>
            <a href="https://x.com/huozhi" target="_blank" rel="noopener noreferrer">
              X
            </a>
          </div>
        </nav>
      </footer>
    </>
  )
}
