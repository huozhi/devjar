import { Code } from '@sugar-high/react'
import { taffy } from '@sugar-high/react/themes'
import { Footer } from '../components/footer'
import { HomeLink } from '../components/home-link'
import { SiteNav } from '../components/site-nav'
import '../styles.css'
import '../docs.css'

const apiDocs = 'https://github.com/huozhi/devjar/blob/main/docs/API.md'
const markdownDocs = 'https://github.com/huozhi/devjar/blob/main/docs/MARKDOWN.md'

type Feature = { name: string, href: string, summary: string }

function HeadingLink({ hash }: { hash: string }) {
  return <a className="docs-heading-link" href={`#${hash}`} aria-label="Copy link to this heading" title="Copy link" onClick={(event) => {
    if (event.currentTarget.closest('summary')) {
      event.preventDefault()
      event.stopPropagation()
      location.hash = hash
    }
    void navigator.clipboard?.writeText(new URL(`#${hash}`, location.href).href).catch(() => {})
  }}>#</a>
}

const featureGroups: { title: string, id: string, features: Feature[] }[] = [
  {
    title: 'Live previews',
    id: 'live-previews',
    features: [
      { name: 'DevJar component', href: '#devjar-component', summary: 'Render project files in a managed iframe.' },
      { name: 'useDevJar hook', href: '#use-devjar', summary: 'Own the iframe and decide when code runs.' },
      { name: 'Scheduling edits', href: `${apiDocs}#scheduling-edits`, summary: 'Debounce updates or run on demand.' },
      { name: 'Loading and errors', href: `${apiDocs}#preview-lifecycle`, summary: 'Show preview lifecycle states.' },
      { name: 'Reset the runtime', href: `${apiDocs}#resetting-the-runtime`, summary: 'Restart a preview without changing source.' },
      { name: 'Hosting previews', href: `${apiDocs}#hosting-embedded-previews`, summary: 'Compiler assets, CSP, and Next.js setup.' },
    ],
  },
  {
    title: 'Static sites',
    id: 'static-sites',
    features: [
      { name: 'File-based routes', href: '#routes', summary: 'Pages, nested routes, and a custom 404.' },
      { name: 'Markdown pages', href: '#markdown', summary: 'Themed HTML pages with no React runtime.' },
      { name: 'Tailwind CSS', href: '#tailwind', summary: 'Utility classes compiled at build time.' },
      { name: 'Imports and assets', href: '#assets', summary: 'JSON, text, CSS, images, and fonts.' },
      { name: 'Public files and static APIs', href: '#public-files', summary: 'Copy files and serve JSON or text.' },
      { name: 'Page metadata', href: '#metadata', summary: 'Favicon and link previews on X, Slack, and more.' },
      { name: 'Sitemap', href: '#sitemap', summary: 'Generate sitemap.xml for built pages.' },
      { name: 'Base path', href: '#base-path', summary: 'Deploy under a subdirectory.' },
      { name: 'Exclude pages', href: '#exclude', summary: 'Keep development pages out of exports.' },
      { name: 'Local packages', href: '#local-packages', summary: 'Develop a library alongside the site.' },
      { name: 'Static output and Vercel', href: '#output', summary: 'Prerendered, self-contained builds.' },
      { name: 'Commands and options', href: '#cli-reference', summary: 'Every CLI command and flag.' },
    ],
  },
]

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
          <h1 id="documentation">Documentation<HeadingLink hash="documentation" /></h1>
          <nav className="docs-contents" aria-label="On this page">
            <a href="#features">Features</a>
            <a href="#browser-only">Browser-only runtime</a>
            <a href="#live-code">Live code APIs</a>
            <a href="#cli">Build a site</a>
            <a href="https://github.com/huozhi/devjar/blob/main/docs/MIGRATION.md">Migrate from Sandpack or React Live ↗</a>
          </nav>
        </header>
        <section id="features" className="usage-section" aria-labelledby="features-heading">
          <div className="usage-content">
            <h2 id="features-heading">Features<HeadingLink hash="features" /></h2>
            <p className="section-intro">Everything Devjar can do, with a link to the details.</p>
          </div>
          <div className="feature-index">
            {featureGroups.map(group => (
              <div key={group.title} className="feature-group">
                <h3 id={group.id}>{group.title}<HeadingLink hash={group.id} /></h3>
                <ul>
                  {group.features.map(feature => (
                    <li key={feature.name}>
                      <a href={feature.href}>
                        {feature.name}
                        {feature.href.startsWith('#') ? null : <span aria-hidden="true"> ↗</span>}
                      </a>
                      <p>{feature.summary}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
        <section id="browser-only" className="usage-section" aria-labelledby="browser-only-heading">
          <div className="usage-content">
            <h2 id="browser-only-heading">Browser-only runtime<HeadingLink hash="browser-only" /></h2>
            <blockquote className="docs-note">
              <p>
                Previews and CLI sites run in the browser.
                Libraries that need a server are not supported.
              </p>
            </blockquote>
          </div>
        </section>
        <section id="live-code" className="usage-section" aria-labelledby="live-code-heading">
          <div className="usage-content">
            <h2 id="live-code-heading">Live code APIs<HeadingLink hash="live-code" /></h2>
            <p className="section-intro">Add live React previews to an editor, docs page, or playground.</p>
            <div id="devjar-component" className="section docs-anchor">
              <h3>Render a project with DevJar<HeadingLink hash="devjar-component" /></h3>
              <p>
                Pass your files as strings to <code>files</code>.
                Devjar runs them in an iframe and updates when they change.
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
              <p>Requires React 19+. Install with <code>npm install devjar</code>. No special hosting headers needed.</p>
              <p>
                Need an editor? Use the <code>Editor</code> from <a href="https://sugar-high.vercel.app/react">@sugar-high/react</a>.
                {' '}Update <code>files</code> in its <code>onChange</code> to refresh the preview.
              </p>
              <p><a href="https://github.com/huozhi/devjar/tree/main/examples/personal">Example: edit in a playground, then export the site →</a></p>
              <a href="https://github.com/huozhi/devjar/blob/main/docs/API.md" target="_blank" rel="noopener noreferrer">
                Full API reference →
              </a>
            </div>

            <div id="use-devjar" className="section docs-anchor">
              <h3>Advanced API: control your own iframe<HeadingLink hash="use-devjar" /></h3>
              <p>Use <code>useDevJar</code> to render into your own iframe and choose when code runs.</p>
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
            <h2 id="build-heading">CLI: build a site without the setup<HeadingLink hash="cli" /></h2>
            <p className="section-intro">
              Build a static site with no config. Requires Node.js 22+.
            </p>

            <div className="section">
              <h3 id="three-commands">Three commands<HeadingLink hash="three-commands" /></h3>
              <p>Develop, build, then preview the build.</p>
              <div className="code-block" aria-label="Devjar commands">
                <Code theme={taffy.light} lang="plaintext" controls={false} fontSize={13}>{`npx devjar dev
npx devjar build
npx devjar start`}</Code>
              </div>
            </div>

            <div id="routes" className="section docs-anchor">
              <h3>Routes from files<HeadingLink hash="routes" /></h3>
              <p>Each file in <code>pages/</code> becomes a route.</p>
              <p>Packages load from a CDN, so there is nothing to install. Pin versions in an optional <code>package.json</code>.</p>
              <div className="code-block" aria-label="Example project structure">
                <Code theme={taffy.light} lang="plaintext" controls={false} fontSize={13}>{`package.json          # optional: dependency versions
pages/
├── index.tsx         → /
├── about.tsx         → /about
├── docs/start.tsx    → /docs/start
└── 404.tsx           → unmatched routes`}</Code>
              </div>
              <p>Files and folders starting with <code>_</code> are not routes. You can still import them.</p>
            </div>

            <div id="markdown" className="section docs-anchor">
              <h3>Markdown pages<HeadingLink hash="markdown" /></h3>
              <p>
                Put <code>.md</code> files in <code>pages/</code>. They build to plain HTML with no JavaScript.
                Pick a theme with <code>--theme</code>: <code>minimal</code>, <code>github</code>, <code>editorial</code>, or <code>academic</code>.
                Add <code>--math</code> for LaTeX.
              </p>
              <div className="code-block" aria-label="Markdown theme example">
                <Code theme={taffy.light} lang="bash" controls={false} fontSize={13}>{`npx devjar dev --theme editorial
npx devjar build --theme editorial --math`}</Code>
              </div>
              <p><a href="/markdown">Compare themes</a> · <a href={markdownDocs}>Markdown guide</a></p>
            </div>

            <div id="tailwind" className="section docs-anchor">
              <h3>Tailwind CSS<HeadingLink hash="tailwind" /></h3>
              <p>
                Add <code>tailwindcss</code> or <code>@tailwindcss/browser</code> to your dependencies.
                Builds output plain CSS. Write full class names, not ones built from strings.
              </p>
              <p>
                Only utility classes work. <code>@theme</code>, <code>@apply</code>, and <code>@utility</code> are not supported.
                For custom styles, use CSS variables and plain classes.
                Import each stylesheet from JS/TS, not with CSS <code>@import</code>.
              </p>
            </div>

            <div id="assets" className="section docs-anchor">
              <h3>Imports and assets<HeadingLink hash="assets" /></h3>
              <div className="code-block" aria-label="Asset import example">
                <Code theme={taffy.light} lang="typescript" controls={false} fontSize={13}>{`import settings from '../settings.json'
import notes from '../notes.md' with { type: 'text' }
import logo from '../assets/logo.svg'
import '../styles.css'`}</Code>
              </div>
              <p>
                JSON imports as data. <code>type: 'text'</code> imports as a string.
                Images, fonts, media, and PDFs import as URLs.
              </p>
            </div>

            <div id="public-files" className="section docs-anchor">
              <h3>Public files and static APIs<HeadingLink hash="public-files" /></h3>
              <div className="code-block" aria-label="Public files and static APIs">
                <Code theme={taffy.light} lang="plaintext" controls={false} fontSize={13}>{`public/logo.svg  → /logo.svg
api/status.json  → /api/status.json
api/message.txt  → /api/message.txt`}</Code>
              </div>
              <p>Files in <code>public/</code> are copied as is. <code>api/</code> serves static JSON or text only.</p>
            </div>

            <div id="metadata" className="section docs-anchor">
              <h3>Page metadata<HeadingLink hash="metadata" /></h3>
              <p>
                Add an icon and a share image to the project root.
                Devjar adds them to every page. No code needed.
              </p>
              <div className="code-block" aria-label="Metadata file conventions">
                <Code theme={taffy.light} lang="plaintext" controls={false} fontSize={13}>{`icon.svg              # browser tab and bookmark icon
opengraph-image.png    # link preview image
pages/
└── index.tsx`}</Code>
              </div>
              <div className="docs-table-wrap">
                <table>
                  <thead><tr><th>File</th><th>Formats</th><th>Used for</th></tr></thead>
                  <tbody>
                    <tr><td><code>icon.*</code></td><td><code>.svg</code>, <code>.png</code>, <code>.ico</code>, <code>.jpg</code>, <code>.jpeg</code>, <code>.gif</code>, <code>.webp</code></td><td>Browser tab icon</td></tr>
                    <tr><td><code>opengraph-image.*</code></td><td><code>.png</code>, <code>.jpg</code>, <code>.jpeg</code>, <code>.gif</code>, <code>.webp</code></td><td>Image in link previews</td></tr>
                  </tbody>
                </table>
              </div>
              <p>Devjar adds these tags to each page:</p>
              <div className="code-block" aria-label="Generated metadata tags">
                <Code theme={taffy.light} lang="html" controls={false} fontSize={13}>{`<link rel="icon" href="/icon.svg" type="image/svg+xml">
<meta property="og:image" content="https://example.com/opengraph-image.png">
<meta name="twitter:image" content="https://example.com/opengraph-image.png">
<meta name="twitter:card" content="summary_large_image">`}</Code>
              </div>
              <p>
                Links then show a large image on X, Slack, Discord, LinkedIn, Facebook, iMessage, WhatsApp, and Telegram.
                Use a 1200 × 630 image.
              </p>
              <p>
                Build with <code>--origin</code> set to your site URL, so image links are absolute.
                Without it, Devjar uses your Vercel URL or <code>http://localhost:3000</code>.
              </p>
              <p>Set each page’s title and description in the page itself:</p>
              <div className="code-block" aria-label="Page metadata example">
                <Code theme={taffy.light} lang="typescript" controls={false} fontSize={13}>{`export default function Page() {
  return (
    <>
      <title>My website</title>
      <meta name="description" content="Notes and projects" />
      <meta property="og:title" content="My website" />
      <meta property="og:description" content="Notes and projects" />
      <h1>Hello</h1>
    </>
  )
}`}</Code>
              </div>
              <p>
                Include the <code>og:</code> tags. Some platforms, like X, ignore <code>&lt;title&gt;</code>.
                Markdown pages take their title and description from <a href={markdownDocs}>frontmatter</a>.
              </p>
            </div>

            <div id="sitemap" className="section docs-anchor">
              <h3>Sitemap<HeadingLink hash="sitemap" /></h3>
              <p>Add <code>--sitemap</code> to <code>build</code> to write <code>sitemap.xml</code>. Set <code>--origin</code> to your site URL.</p>
              <div className="code-block" aria-label="Sitemap build example">
                <Code theme={taffy.light} lang="bash" controls={false} fontSize={13}>{`npx devjar build --origin https://example.com --sitemap
npx devjar build --origin https://example.com --base /blog/ --sitemap=site-map.xml`}</Code>
              </div>
              <p>It lists every built page except <code>404</code> and excluded pages. A custom filename must end in <code>.xml</code>.</p>
            </div>

            <div id="base-path" className="section docs-anchor">
              <h3>Base path<HeadingLink hash="base-path" /></h3>
              <p>Use <code>--base</code> to host the site in a subdirectory. Pass it to both <code>dev</code> and <code>build</code>.</p>
              <div className="code-block" aria-label="Base path example">
                <Code theme={taffy.light} lang="bash" controls={false} fontSize={13}>{`npx devjar build --base /preview/
npx devjar start`}</Code>
              </div>
            </div>

            <div id="exclude" className="section docs-anchor">
              <h3>Exclude pages<HeadingLink hash="exclude" /></h3>
              <p>Leave drafts or playgrounds out of the build. They still work in <code>dev</code>. Repeat the flag for more paths.</p>
              <div className="code-block" aria-label="Exclude pages example">
                <Code theme={taffy.light} lang="bash" controls={false} fontSize={13}>{`npx devjar build --exclude pages/playground.tsx --exclude pages/drafts`}</Code>
              </div>
            </div>

            <div id="local-packages" className="section docs-anchor">
              <h3>Local packages<HeadingLink hash="local-packages" /></h3>
              <p>Point a dependency at a local folder. Devjar compiles it, watches for edits, and bundles it in builds.</p>
              <div className="code-block" aria-label="Local package example">
                <Code theme={taffy.light} lang="json" controls={false} fontSize={13}>{`{
  "dependencies": {
    "my-library": "file:../my-library"
  }
}`}</Code>
              </div>
            </div>

            <div id="output" className="section docs-anchor">
              <h3>Static output for any host<HeadingLink hash="output" /></h3>
              <p>
                Every page is prerendered to HTML, with all dependencies included.
                Deploy <code>dist/</code> to any static host.
              </p>
              <p>On Vercel, choose the Other preset. Caching is set up for you.</p>
            </div>

            <details id="cli-reference" className="section docs-details">
              <summary>All commands and options<HeadingLink hash="cli-reference" /></summary>
              <p>Usage: <code>npx devjar [command] [root] [options]</code>. <code>root</code> defaults to the current folder.</p>
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
              <h3 id="options">Options<HeadingLink hash="options" /></h3>
              <div className="docs-table-wrap">
                <table>
                  <thead><tr><th>Option</th><th>Commands</th><th>Default and purpose</th></tr></thead>
                  <tbody>
                    <tr><td><code>--host &lt;host&gt;</code></td><td>dev, start</td><td><code>localhost</code>; use <code>0.0.0.0</code> for network access.</td></tr>
                    <tr><td><code>--port &lt;port&gt;</code>, <code>-p</code></td><td>dev, start</td><td><code>3000</code>; port to listen on.</td></tr>
                    <tr><td><code>--cdn &lt;url&gt;</code></td><td>dev, build</td><td><code>https://esm.sh</code>; ESM module CDN.</td></tr>
                    <tr><td><code>--exclude &lt;path&gt;</code></td><td>build</td><td>Leave a page or folder out. Repeatable.</td></tr>
                    <tr><td><code>--math</code></td><td>dev, build</td><td>Render LaTeX math in Markdown pages.</td></tr>
                    <tr><td><code>--theme &lt;name&gt;</code></td><td>dev, build</td><td><code>minimal</code>, <code>github</code>, <code>editorial</code>, or <code>academic</code>; defaults to <code>minimal</code>.</td></tr>
                    <tr><td><code>--base &lt;path&gt;</code></td><td>dev, build</td><td><code>/</code>; public path for subdirectory deployment.</td></tr>
                    <tr><td><code>--origin &lt;url&gt;</code></td><td>build</td><td>Site URL for share images and the sitemap. Defaults to your Vercel URL or <code>http://localhost:3000</code>.</td></tr>
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
