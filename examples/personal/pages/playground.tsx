import { useState } from 'react'
import { DevJar } from 'devjar'
import { Editor } from '@sugar-high/react'
import home from './index.tsx' with { type: 'text' }
import notFound from './404.tsx' with { type: 'text' }
import layout from '../components/layout.tsx' with { type: 'text' }
import styles from '../styles.css' with { type: 'text' }
import content from '../content.json' with { type: 'text' }
import '../playground.css'

// The preview uses the actual website files, not a separate copy of the theme.
const project = {
  'pages/index.tsx': home,
  'pages/404.tsx': notFound,
  'pages/playground.tsx': `export default function Edit() {
    return <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <p>You’re already in the playground. Edit content.json beside this preview.</p>
      <a href="/">Back to the homepage</a>
    </main>
  }`,
  'components/layout.tsx': layout,
  'styles.css': styles,
  'content.json': content,
}
const monochrome = { background: '#fff', foreground: '#222', string: '#666', keyword: '#222', property: '#444', identifier: '#444', sign: '#999', comment: '#999' }
const dependencies = { react: '19.2.8', 'react-dom': '19.2.8' }

export default function Playground() {
  const [files, setFiles] = useState(project)
  const [error, setError] = useState<unknown>(null)
  const [copyStatus, setCopyStatus] = useState('Copy content')

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(files['content.json'])
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Select the code to copy')
    }
  }

  return (
    <main className="playground">
      <title>Make it yours — Personal site playground</title>
      <header className="playground-header"><a href="/">← View the website</a><span>A simple résumé, built with Devjar</span></header>
      <section className="playground-intro"><p className="label">01 / Make it yours</p><h1>Make this résumé yours.</h1><p>Edit your name, experience, and projects. See the changes in the preview.</p></section>
      <div className="playground-panels">
        <section className="content-editor" aria-label="Edit site content">
          <div className="editor-bar"><span>content.json</span><div><button onClick={() => { setFiles(project); setCopyStatus('Copy content') }}>Reset</button><button onClick={copyContent}>{copyStatus}</button></div></div>
          <Editor theme={monochrome} extension="json" controls={false} title={null} fontSize={12}
            value={files['content.json']} textareaProps={{ 'aria-label': 'Site content JSON' }}
            onChange={value => { setFiles(current => ({ ...current, 'content.json': value })); setCopyStatus('Copy content') }} />
          <p className="editor-error" role="status">{error ? String(error instanceof Error ? error.message : error) : ''}</p>
        </section>
        <DevJar title="Personal website live preview" files={files} dependencies={dependencies} tailwind={false} onError={setError} />
      </div>
      <section className="export-guide">
        <div><p className="label">02 / Take it with you</p><h2>Same files. Your own website.</h2><p>Copy your edits into <code>content.json</code> in this example. Build it, preview the export, then publish <code>dist/</code> on a static host.</p><a href="https://github.com/huozhi/devjar/tree/main/examples/personal">Get the theme source ↗</a></div>
        <pre><code>{`# From examples/personal\nnpx devjar build --exclude pages/playground.tsx\nnpx devjar start`}</code></pre>
      </section>
      <p className="playground-footnote">Edits here stay in this browser tab. Copy the content before leaving. The example README covers running the published CLI and hosting headers for this playground.</p>
    </main>
  )
}
