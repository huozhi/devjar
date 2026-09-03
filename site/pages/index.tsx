import { Codesandbox } from '../components/codesandbox'
import { demoFiles } from '../lib/demo-files'
import '../styles.css'

const description = 'Turn a folder of React pages into a self-contained static site.'
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
        <section className="intro-section">
          <nav className="intro-links" aria-label="Project links">
            <a href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="https://x.com/huozhi" target="_blank" rel="noopener noreferrer">
              X
            </a>
          </nav>
          <h1>devjar</h1>
          <p className="intro-copy">Zero-dependency React prototyping.</p>
        </section>

        <div className="playground-container">
          <div className="playground-wrapper">
            <Codesandbox files={demoFiles} />
          </div>
        </div>

        <section className="usage-section" aria-labelledby="build-heading">
          <div className="usage-content">
            <h2 id="build-heading">Build a site without the setup</h2>
            <p className="section-intro">
              Devjar keeps the project structure simple and handles the production details for you.
            </p>

            <div className="section">
              <h3>Routes from files</h3>
              <p>Files inside <code>pages/</code> become routes, including nested pages and a custom 404.</p>
              <div className="code-block" aria-label="Example project structure">
                <pre><code>{`pages/
├── index.tsx       → /
├── about.tsx       → /about
└── docs/
    └── start.tsx   → /docs/start`}</code></pre>
              </div>
            </div>

            <div className="section">
              <h3>Self-contained production builds</h3>
              <p>
                Routes are prerendered to HTML. Dependencies are vendored, and imported assets and Tailwind CSS are emitted with content hashes.
              </p>
            </div>

            <div className="section">
              <h3>Three commands</h3>
              <p>Develop locally, create the static output, then preview exactly what you will deploy.</p>
              <div className="code-block" aria-label="Devjar commands">
                <pre><code>{`npx devjar dev
npx devjar build
npx devjar start`}</code></pre>
              </div>
            </div>

            <div className="section section-links">
              <h3>Ready for any static host</h3>
              <p>
                Deploy the generated files at the domain root or use <code>--base</code> for a subdirectory.
              </p>
              <a href="https://github.com/huozhi/devjar#cli" target="_blank" rel="noopener noreferrer">
                Read the CLI documentation →
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <nav className="site-footer" aria-label="Footer links">
          <div className="footer-links">
            <a href="https://github.com/huozhi/devjar" target="_blank" rel="noopener noreferrer">
              GitHub
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
