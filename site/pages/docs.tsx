import { Code } from '@sugar-high/react'
import { taffy } from '@sugar-high/react/themes'
import { Footer } from '../components/footer'
import { HomeLink } from '../components/home-link'
import { SiteNav } from '../components/site-nav'
import '../styles.css'
import '../docs.css'

const title = 'Documentation — Devjar'
const description = 'Embed a live React playground or build a site with Devjar. Setup, examples, and API references.'

export default function Docs() {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <link rel="alternate" type="text/plain" title="Devjar agent reference" href="/llms.txt" />
      <main className="docs-page">
        <header className="docs-header">
          <div className="docs-topbar">
            <HomeLink />
            <SiteNav active="docs" />
          </div>
          <h1>Documentation</h1>
          <nav className="docs-contents" aria-label="On this page">
            <a href="#browser-only">Browser-only runtime</a>
            <a href="#live-code">Live code APIs</a>
            <a href="#cli">Build a site</a>
            <a href="https://github.com/huozhi/devjar/blob/main/docs/MIGRATION.md">Migrate from Sandpack or React Live ↗</a>
          </nav>
        </header>
        <section id="browser-only" className="usage-section" aria-labelledby="browser-only-heading">
          <div className="usage-content">
            <h2 id="browser-only-heading">Browser-only runtime</h2>
            <blockquote className="docs-note">
              <p>
                DevJar previews and CLI sites run in the browser.
                Server-only libraries and libraries that require a server runtime are not supported.
              </p>
            </blockquote>
          </div>
        </section>
        <section id="live-code" className="usage-section" aria-labelledby="live-code-heading">
          <div className="usage-content">
            <h2 id="live-code-heading">Live code APIs</h2>
            <p className="section-intro">Build your own editor, interactive docs, or shader playground with live React previews.</p>
            <div className="section">
              <h3>Render a project with DevJar</h3>
              <p>
                The live examples use the <code>DevJar</code> component.
                Pass project files as strings, connect your editor to the <code>files</code> prop,
                and watch changes run inside an iframe. Use <code>useDevJar</code> to control your own iframe.
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
              <p>Requires React 19 or newer. Install with <code>npm install devjar</code>. Embedded previews run in the browser; no special hosting headers required.</p>
              <p>
                For a live code editor, pair Devjar with <a href="https://sugar-high.vercel.app/react">@sugar-high/react</a>.
                {' '}Its <code>Editor</code> component provides syntax highlighting; update <code>files</code> from
                its <code>onChange</code> callback to refresh the preview. The gallery demos use this combination.
              </p>
              <p><a href="https://github.com/huozhi/devjar/tree/main/examples/personal">Personal website example: live playground to static export →</a></p>
              <a href="https://github.com/huozhi/devjar/blob/main/docs/API.md" target="_blank" rel="noopener noreferrer">
                Read the component and iframe documentation →
              </a>
            </div>

            <div className="section">
              <h3>Advanced API: control your own iframe</h3>
              <p>Use <code>DevJar</code> for managed previews. The advanced <code>useDevJar</code> hook lets you own the iframe and decide when a project runs.</p>
              <div className="code-block" aria-label="useDevJar hook example">
                <Code theme={taffy.light} lang="typescript" controls={false} fontSize={13}>{`import { useDevJar } from 'devjar'

function Preview({ files }) {
  const { ref, load, error } = useDevJar({ tailwind: false })

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

        <section id="cli" className="usage-section" aria-labelledby="build-heading">
          <div className="usage-content">
            <h2 id="build-heading">CLI: build a site without the setup</h2>
            <p className="section-intro">
              Requires Node.js 22 or newer. Devjar keeps the project structure simple and handles the production details for you.
            </p>

            <div className="section">
              <h3>Routes from files</h3>
              <p>Files inside <code>pages/</code> become routes, including nested pages and a custom 404.</p>
              <p>An optional <code>package.json</code> pins dependency versions. Packages load from the CDN, so you don’t need to install them.</p>
              <div className="code-block" aria-label="Example project structure">
                <Code theme={taffy.light} lang="plaintext" controls={false} fontSize={13}>{`package.json          # optional: dependency versions
icon.svg              # shared site icon
opengraph-image.jpg    # shared social image
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
              <h3>Tailwind CSS</h3>
              <p>
                Add <code>tailwindcss</code> or <code>@tailwindcss/browser</code> to enable Tailwind.
                Use complete class names; builds emit CSS with no runtime compiler.
              </p>
              <p>
                Tailwind support is limited to utility classes. Tailwind-specific directives in imported CSS,
                such as <code>@theme</code>, <code>@apply</code>, and <code>@utility</code>, are not supported.
                Use CSS variables, ordinary classes, and native media queries for custom styles.
                Import each stylesheet from JS/TS; nested CSS <code>@import</code> rules are not supported in development.
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

            <details id="cli-reference" className="section docs-details">
              <summary>Detailed CLI reference: sitemap and options</summary>
              <p>Run <code>npx devjar [command] [root] [options]</code>. The project root defaults to the current directory. Running without arguments shows help.</p>
              <div className="docs-table-wrap">
                <table>
                  <thead><tr><th>Command</th><th>What it does</th></tr></thead>
                  <tbody>
                    <tr><td><code>dev [root]</code></td><td>Serve source pages with live updates.</td></tr>
                    <tr><td><code>build [root]</code></td><td>Export the site to <code>dist/</code>.</td></tr>
                    <tr><td><code>start [root]</code></td><td>Serve an existing build.</td></tr>
                  </tbody>
                </table>
              </div>
              <h3>Sitemap</h3>
              <p>Pass <code>--sitemap</code> to <code>build</code> to write <code>sitemap.xml</code> in the output directory. Set <code>--origin</code> to your public site URL; use <code>--base</code> when deploying under a subdirectory.</p>
              <div className="code-block" aria-label="Sitemap build example">
                <Code theme={taffy.light} lang="bash" controls={false} fontSize={13}>{`npx devjar build --origin https://example.com --sitemap
npx devjar build --origin https://example.com --base /blog/ --sitemap=site-map.xml`}</Code>
              </div>
              <p>The sitemap includes built page routes, excluding <code>404</code> and pages omitted with <code>--exclude</code>. The filename must be an <code>.xml</code> file in the output directory root. Without <code>--origin</code>, the build uses the Vercel production URL when available, or <code>http://localhost:3000</code>.</p>
              <h3>Options</h3>
              <div className="docs-table-wrap">
                <table>
                  <thead><tr><th>Option</th><th>Commands</th><th>Default and purpose</th></tr></thead>
                  <tbody>
                    <tr><td><code>--host &lt;host&gt;</code></td><td>dev, start</td><td><code>localhost</code>; use <code>0.0.0.0</code> for network access.</td></tr>
                    <tr><td><code>--port &lt;port&gt;</code>, <code>-p</code></td><td>dev, start</td><td><code>3000</code>; port to listen on.</td></tr>
                    <tr><td><code>--cdn &lt;url&gt;</code></td><td>dev, build</td><td><code>https://esm.sh</code>; ESM module CDN.</td></tr>
                    <tr><td><code>--exclude &lt;path&gt;</code></td><td>build</td><td>Omit a page file or directory; repeat the option for multiple paths.</td></tr>
                    <tr><td><code>--math</code></td><td>dev, build</td><td>Render LaTeX math in Markdown pages.</td></tr>
                    <tr><td><code>--theme &lt;name&gt;</code></td><td>dev, build</td><td><code>minimal</code>, <code>github</code>, <code>editorial</code>, or <code>academic</code>; defaults to <code>minimal</code>.</td></tr>
                    <tr><td><code>--base &lt;path&gt;</code></td><td>dev, build</td><td><code>/</code>; public path for subdirectory deployment.</td></tr>
                    <tr><td><code>--origin &lt;url&gt;</code></td><td>build</td><td>Absolute origin for metadata and sitemap URLs; defaults to the Vercel production URL or <code>http://localhost:3000</code>.</td></tr>
                    <tr><td><code>--sitemap[=&lt;filename&gt;]</code></td><td>build</td><td>Write a sitemap; default filename <code>sitemap.xml</code>.</td></tr>
                    <tr><td><code>-o</code>, <code>--out-dir &lt;directory&gt;</code></td><td>build, start</td><td><code>dist</code>; output directory inside the project.</td></tr>
                    <tr><td><code>-h</code>, <code>--help</code></td><td>all</td><td>Show help.</td></tr>
                    <tr><td><code>-v</code>, <code>--version</code></td><td>all</td><td>Show the installed version.</td></tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
