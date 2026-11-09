'use client'

import { useState } from 'react'

const files = [
  { name: 'chart.tsx', note: 'React component' },
  { name: 'notes.md', note: 'Markdown page' },
  { name: 'report.html', note: 'HTML, served as-is' },
]

function ChartPreview() {
  return (
    <div className="preview-demo-chart" aria-hidden="true">
      <span className="preview-demo-kicker">WEEKLY VISITS</span>
      <div className="preview-demo-bars">
        {[38, 52, 46, 70, 64, 88, 76].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
      </div>
    </div>
  )
}

function NotesPreview() {
  return (
    <div className="preview-demo-notes" aria-hidden="true">
      <div className="preview-demo-notes-title">Launch notes</div>
      <p>Ship the beta on Friday. Keep the scope small.</p>
      <ul><li>Write the changelog</li><li>Record a short demo</li></ul>
    </div>
  )
}

function ReportPreview() {
  return (
    <div className="preview-demo-report" aria-hidden="true">
      <span className="preview-demo-kicker">Q3 REPORT</span>
      <div className="preview-demo-stats">
        <div><strong>4.2k</strong><span>signups</span></div>
        <div><strong>38%</strong><span>retention</span></div>
      </div>
      <div className="preview-demo-lines"><span /><span /><span /></div>
    </div>
  )
}

const previews = [ChartPreview, NotesPreview, ReportPreview]

export function PreviewDemo() {
  const [active, setActive] = useState(0)
  const file = files[active]
  const Preview = previews[active]

  return (
    <section className="deploy-section preview-demo" aria-labelledby="preview-title">
      <div className="deploy-heading">
        <div>
          <h2 id="preview-title">Single File Preview</h2>
          <p>Open the file an agent just wrote. No project, no pages/ folder, no setup.</p>
        </div>
      </div>
      <div className="preview-demo-files" role="group" aria-label="Choose a file">
        {files.map((item, index) => <button key={item.name} aria-pressed={active === index} onClick={() => setActive(index)}>
          <code>{item.name}</code><span>{item.note}</span>
        </button>)}
      </div>
      <div className="deploy-terminal-body preview-demo-body">
        <div className="preview-demo-terminal">
          <code><span className="deploy-prompt">$ </span>npx devjar {file.name}</code>
          <code className="preview-demo-muted">Local  http://localhost:3000/</code>
          <code className="preview-demo-muted">Serving  {file.name}</code>
          <p className="preview-demo-caption">
            Saving the file reloads the page. Browser errors and failed loads print here, so an agent can fix them without opening a browser.
          </p>
        </div>
        <div className="deploy-browser" role="img" aria-label={`Browser preview of ${file.name} at localhost:3000`}>
          <div className="deploy-browser-address" aria-hidden="true"><span>localhost:3000</span></div>
          <div className="preview-demo-page"><Preview /></div>
        </div>
      </div>
      <p className="deploy-note">A folder works too: <code>npx devjar ./output</code> lists and serves every HTML file in it.</p>
    </section>
  )
}
