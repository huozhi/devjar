export const markdownThemes = ['paper', 'academic', 'lecture', 'book'] as const
export type MarkdownTheme = typeof markdownThemes[number]

export function markdownTheme(value: string | undefined): MarkdownTheme {
  if (value === undefined) return 'paper'
  if (!(markdownThemes as readonly string[]).includes(value)) {
    throw new Error(`Unknown Markdown theme: ${value}. Choose paper, academic, lecture, or book.`)
  }
  return value as MarkdownTheme
}

// Low-specificity selectors keep ordinary project CSS easy to override.
export const markdownStyles = `
:where(:root) {
  color-scheme: light dark;
  --md-bg: #fff; --md-text: #292929; --md-muted: #727272; --md-accent: #315f88;
  --md-surface: #f5f5f3; --md-border: #deded8; --md-content-width: 70ch; --md-radius: 3px;
  --md-font-body: Georgia, "Noto Serif CJK SC", "Songti SC", serif;
  --md-font-heading: var(--md-font-body);
  --md-font-code: ui-monospace, SFMono-Regular, Consolas, monospace;
}
:where(html) { background: var(--md-bg); color: var(--md-text); scroll-padding-top: 2rem; }
:where(body) { margin: 0; font: 17px/1.8 var(--md-font-body); overflow-wrap: break-word; }
:where(.devjar-markdown) { max-width: var(--md-content-width); margin: 0 auto; padding: clamp(2rem, 7vw, 6rem) 1.5rem 5rem; }
:where(.md-home) { display: inline-block; margin-bottom: 2rem; color: var(--md-muted); font: .8rem/1.5 system-ui, sans-serif; text-decoration: none; }
:where(h1, h2, h3, h4, h5, h6) { font-family: var(--md-font-heading); line-height: 1.2; color: var(--md-text); text-wrap: balance; }
:where(h1) { font-size: clamp(2.2rem, 5vw, 3.2rem); font-weight: 500; letter-spacing: -.035em; margin: 0 0 1.4rem; }
:where(h2) { font-size: 1.7rem; font-weight: 500; margin: 2.8rem 0 1rem; }
:where(h3) { font-size: 1.25rem; margin: 2rem 0 .8rem; }
:where(h4, h5, h6) { font-size: 1rem; margin: 1.5rem 0 .7rem; }
:where(p, ul, ol, blockquote, pre, table) { margin: 1.2rem 0; }
:where(li + li) { margin-top: .35rem; }
:where(li > p) { margin: .5rem 0; }
:where(a) { color: var(--md-accent); text-decoration-thickness: 1px; text-underline-offset: .2em; }
:where(a:hover) { text-decoration-thickness: 2px; }
:where(a:focus-visible, input:focus-visible) { outline: 2px solid var(--md-accent); outline-offset: 4px; }
:where(blockquote) { border-left: 2px solid var(--md-border); margin-inline: 0; padding: .1rem 1.5rem; color: var(--md-muted); }
:where(code) { font: .82em/1.6 var(--md-font-code); background: var(--md-surface); padding: .15em .35em; border-radius: var(--md-radius); }
:where(pre) { overflow-x: auto; padding: 1.25rem 1.5rem; background: var(--md-surface); border: 1px solid var(--md-border); border-radius: var(--md-radius); }
:where(pre code) { padding: 0; background: none; }
:where(img) { max-width: 100%; height: auto; }
:where(hr) { margin: 3rem 0; border: 0; border-top: 1px solid var(--md-border); }
:where(.md-table) { overflow-x: auto; }
:where(table) { border-collapse: collapse; width: 100%; font-size: .9em; }
:where(th, td) { text-align: start; padding: .65rem .9rem; border-bottom: 1px solid var(--md-border); }
:where(th) { border-bottom: 2px solid var(--md-text); font-weight: 600; }
:where(.md-byline, .md-description) { color: var(--md-muted); }
:where(.md-byline) { font-size: .9rem; margin-bottom: 2.5rem; }
:where(.md-description) { font-size: 1.1em; }
:where(.md-toc) { font: .85rem/1.7 system-ui, sans-serif; padding: 1rem 0; margin: 2rem 0; border-block: 1px solid var(--md-border); }
:where(.md-toc ol) { margin: .5rem 0 0; padding-inline-start: 1.3rem; }
:where(.md-toc a) { color: var(--md-muted); text-decoration: none; }
:where(.footnotes) { font-size: .82em; margin-top: 4rem; border-top: 1px solid var(--md-border); padding-top: 1rem; }
:where(.footnotes h2) { font-size: 1rem; margin-top: .5rem; }
:where(sup a) { font: .75em var(--md-font-code); text-decoration: none; }
:where(.sr-only) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
:where([data-md-theme="paper"] h1, [data-md-theme="paper"] .md-byline) { text-align: center; }
:where([data-md-theme="paper"] h1) { margin-top: 1rem; font-size: clamp(2rem, 4vw, 2.7rem); }
:where([data-md-theme="academic"]) { --md-bg: #fafbf9; --md-accent: #256058; --md-content-width: 74ch; }
:where([data-md-theme="academic"] h2) { border-bottom: 1px solid var(--md-border); padding-bottom: .5rem; }
:where([data-md-theme="academic"] h1) { font-weight: 600; }
:where([data-md-theme="lecture"]) { --md-font-body: system-ui, "Noto Sans CJK SC", "PingFang SC", sans-serif; --md-content-width: 76ch; --md-accent: #365fc6; --md-surface: #f1f4fa; --md-radius: 8px; }
:where([data-md-theme="lecture"] h1) { font-weight: 750; letter-spacing: -.04em; }
:where([data-md-theme="lecture"] h2) { font-size: 1.4rem; font-weight: 650; border-top: 1px solid var(--md-border); padding-top: 2rem; }
:where([data-md-theme="lecture"] blockquote) { border-color: var(--md-accent); background: var(--md-surface); border-radius: 0 var(--md-radius) var(--md-radius) 0; }
:where([data-md-theme="book"]) { --md-bg: #fffff8; --md-text: #27251f; --md-muted: #79766d; --md-accent: #735331; --md-surface: #f3f1e7; --md-border: #dedbce; --md-content-width: 62ch; }
:where([data-md-theme="book"] body) { font-size: 19px; }
:where([data-md-theme="book"] h1) { font-size: clamp(2.6rem, 6vw, 4rem); font-weight: 400; }
:where([data-md-theme="book"] h2) { font-style: italic; font-weight: 400; }
:where([data-md-theme="book"] a) { color: inherit; }
:where([data-md-theme="book"] blockquote) { border: 0; font-style: italic; }
@media (min-width: 1100px) {
  :where([data-md-theme="book"] .devjar-markdown) { margin-left: max(8vw, calc((100vw - 1000px) / 2)); margin-right: 0; }
}
@media (prefers-color-scheme: dark) {
  :where(:root) { --md-bg: #191919; --md-text: #e2e2df; --md-muted: #a5a5a0; --md-accent: #95b9de; --md-surface: #242424; --md-border: #3d3d39; }
  :where([data-md-theme="academic"]) { --md-bg: #181c1b; --md-accent: #8cc4b5; }
  :where([data-md-theme="lecture"]) { --md-accent: #9ab5ff; --md-surface: #202737; }
  :where([data-md-theme="book"]) { --md-bg: #1b1a17; --md-text: #e7e3d7; --md-muted: #b1ac9e; --md-accent: #d7b58f; --md-surface: #27251f; --md-border: #413d32; }
}
@media print {
  :where(:root) { color-scheme: light; --md-bg: white; --md-text: black; --md-muted: #444; --md-surface: #f5f5f5; --md-border: #ccc; }
  :where(.devjar-markdown) { max-width: none; margin: 0; padding: 0; }
  :where(.md-home, .md-toc) { display: none; }
  :where(pre, blockquote, table, img) { break-inside: avoid; }
  :where(h1, h2, h3) { break-after: avoid; }
}
`
