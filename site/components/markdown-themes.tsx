import { useState } from 'react'

const themes = [
  { id: 'minimal', name: 'Minimal', description: 'Room to breathe.' },
  { id: 'github', name: 'GitHub', description: 'Made for documentation.' },
  { id: 'editorial', name: 'Editorial', description: 'For slower reading.' },
  { id: 'academic', name: 'Academic', description: 'Notes, data, and equations.' },
] as const

export function MarkdownThemes() {
  const [selected, setSelected] = useState<(typeof themes)[number]>(themes[0])
  const url = `/markdown-previews/${selected.id}/`
  return <div className="markdown-themes">
    <div className="markdown-themes-tabs" role="tablist" aria-label="Markdown themes">
      {themes.map(theme => <button key={theme.id} type="button" role="tab" id={`markdown-theme-${theme.id}`}
        aria-selected={theme.id === selected.id} aria-controls="markdown-theme-panel" onClick={() => setSelected(theme)}>
        {theme.name}
      </button>)}
    </div>
    <div id="markdown-theme-panel" role="tabpanel" aria-labelledby={`markdown-theme-${selected.id}`}>
      <iframe key={selected.id} title={`${selected.name} theme preview`} src={url} loading="lazy" />
      <p className="markdown-themes-caption">
        <code>--theme {selected.id}</code> · {selected.description} <a href={url} target="_blank" rel="noopener">Open the full site ↗</a>
      </p>
    </div>
  </div>
}
