import { Codesandbox } from '../components/codesandbox'
import { demoFiles } from '../lib/demo-files'
import '../styles.css'

const description = 'React Live Preview in Browser'
const socialImage = '/og-image.png'

export default function Page() {
  return (
    <>
      <title>devjar</title>
      <meta name="description" content={description} />
      <meta name="author" content="@huozhi" />
      <meta property="og:title" content="devjar" />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={socialImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={socialImage} />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
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
