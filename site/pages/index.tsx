import { Code } from '@sugar-high/react'
import { taffy } from '@sugar-high/react/themes'
import { Banner } from '../components/banner'
import { ExampleGallery } from '../components/example-gallery'
import '../styles.css'

const title = 'Devjar — Live Playground & Static Site Export'
const description = 'Live React playgrounds and a zero-config CLI for exporting React pages as static websites.'
const socialImage = '/og-image.jpg'

export default function Page() {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="author" content="@huozhi" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={socialImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={socialImage} />
      <link rel="alternate" type="text/plain" title="Devjar agent reference" href="/llms.txt" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <main>
        <Banner />

        <div className="playground-container" id="live-demo">
          <div className="playground-wrapper">
            <ExampleGallery />
          </div>
        </div>

        <section className="usage-section" aria-labelledby="live-code-heading">
          <div className="usage-content">
            <h2 id="live-code-heading">Live code APIs</h2>
            <p className="section-intro">Build your own editor, interactive docs, or shader playground with live React previews.</p>
            <div className="section">
              <h3>Render a project with DevJar</h3>
              <p>
                All four gallery demos use the <code>DevJar</code> component.
                Pass project files as strings, connect your editor to the <code>files</code> prop,
                and watch changes run inside an iframe. Use <code>useLiveCode</code> to control your own iframe.
              </p>
              <div className="code-block" aria-label="DevJar component example">
                <Code theme={taffy.light} lang="typescript" controls={false} fontSize={13}>{`import { DevJar } from 'devjar'

const files = {
  'pages/index.tsx': \`export default function Page() {
    return <h1>Hello from devjar</h1>
  }\`,
}

function Preview() {
  return (
    <DevJar files={files} title="Live preview" />
  )
}`}</Code>
              </div>
              <p>Embedded previews need a secure context and cross-origin isolation headers.</p>
              <p><a href="https://github.com/huozhi/devjar/tree/main/examples/personal">Personal website example: live playground to static export →</a></p>
              <a href="https://github.com/huozhi/devjar#devjar-component" target="_blank" rel="noopener noreferrer">
                Read the component and iframe documentation →
              </a>
            </div>

            <div className="section">
              <h3>Control your own iframe</h3>
              <p>Use <code>useLiveCode</code> when you want to decide when a project runs.</p>
              <div className="code-block" aria-label="useLiveCode hook example">
                <Code theme={taffy.light} lang="typescript" controls={false} fontSize={13}>{`import { useLiveCode } from 'devjar'

function Preview({ files }) {
  const { ref, load, error } = useLiveCode({ tailwind: false })

  return (
    <>
      <button onClick={() => void load(files)}>Run</button>
      {error != null && <pre>{String(error)}</pre>}
      <iframe ref={ref} title="Live preview" />
    </>
  )
}`}</Code>
              </div>
            </div>
          </div>
        </section>

        <section className="usage-section" aria-labelledby="build-heading">
          <div className="usage-content">
            <h2 id="build-heading">CLI: build a site without the setup</h2>
            <p className="section-intro">
              Devjar keeps the project structure simple and handles the production details for you.
            </p>

            <div className="section">
              <h3>Routes from files</h3>
              <p>Files inside <code>pages/</code> become routes, including nested pages and a custom 404.</p>
              <p>An optional <code>package.json</code> pins dependency versions. Packages load from the CDN, so you don’t need to install them.</p>
              <div className="code-block" aria-label="Example project structure">
                <Code theme={taffy.light} lang="plaintext" controls={false} fontSize={13}>{`package.json          # optional: dependency versions
pages/
├── index.tsx          → /
├── about.tsx          → /about
└── docs/
    └── start.tsx      → /docs/start`}</Code>
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
                <Code theme={taffy.light} lang="plaintext" controls={false} fontSize={13}>{`npx devjar dev
npx devjar build
npx devjar start`}</Code>
              </div>
            </div>

            <div className="section section-links">
              <h3>Ready for any static host</h3>
              <p>
                Deploy the generated files at the domain root or use <code>--base</code> for a subdirectory.
              </p>

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
