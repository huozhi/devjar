import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { Marked, Renderer } from 'marked'
import markedFootnote from 'marked-footnote'
import { parse as parseYaml } from 'yaml'
import { routeFromCliPage, isInside } from './routes'
import { withBase } from '../shared/project'
import { compileProjectModule, isStaticAsset } from './modules'
import { type MarkdownTheme } from './markdown-theme'

export function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export type MarkdownOptions = {
  root: string
  page: string
  routes: Map<string, string>
  base: string
  theme: MarkdownTheme
  liveReload: boolean
  assetUrl: (path: string, contents: Buffer) => string
}

export type MarkdownPage = {
  title: string
  description: string
  lang: string
  markup: string
  styles: string
  assets: Map<string, Buffer>
}

export async function renderMarkdown(options: MarkdownOptions): Promise<MarkdownPage> {
  try {
    return await renderPage(options)
  } catch (error) {
    throw new Error(`Unable to render ${relative(options.root, options.page)}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function renderPage(options: MarkdownOptions): Promise<MarkdownPage> {
  let source = (await readFile(options.page, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  let metadata: Record<string, unknown> = {}
  if (source.startsWith('---\n')) {
    const end = source.indexOf('\n---', 4)
    if (end < 0 || !/^\n---(?:\n|$)/.test(source.slice(end))) throw new Error('Unclosed YAML frontmatter')
    const parsed = parseYaml(source.slice(4, end), { uniqueKeys: true })
    if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('Frontmatter must be an object')
    metadata = parsed || {}
    source = source.slice(end + 4).replace(/^\n/, '')
  }
  for (const name of ['title', 'description', 'author', 'date', 'lang']) {
    if (metadata[name] !== undefined && typeof metadata[name] !== 'string') throw new Error(`Frontmatter ${name} must be a string`)
  }
  const assets = new Map<string, Buffer>()
  const headings: { id: string, text: string, depth: number }[] = []
  const headingIds = new Map<string, number>()
  const rewritten = new WeakSet<object>()
  const parser = new Marked(markedFootnote({ description: 'Notes' }))
  parser.use({
    async: true,
    renderer: {
      html({ text }) { return escapeHtml(text) },
      heading({ tokens, depth, text }) {
        const plain = text.replace(/[*_`]/g, '')
        const slug = plain.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section'
        const count = headingIds.get(slug) || 0
        headingIds.set(slug, count + 1)
        const id = count ? `${slug}-${count + 1}` : slug
        headings.push({ id, text: plain, depth })
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      table(token) { return `<div class="md-table">${Renderer.prototype.table.call(this, token)}</div>` },
    },
    async walkTokens(token) {
      if (token.type !== 'link' && token.type !== 'image') return
      if (rewritten.has(token)) return
      rewritten.add(token)
      const href = token.href
      if (!href || href.startsWith('#')) return
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) {
        if (!/^(https?:|mailto:|tel:)/i.test(href) && !href.startsWith('//')) token.href = ''
        return
      }
      const [pathname] = href.split(/[?#]/, 1)
      const suffix = href.slice(pathname.length)
      const path = pathname.startsWith('/')
        ? resolve(options.root, 'pages', '.' + pathname)
        : resolve(dirname(options.page), decodeURIComponent(pathname))
      if (!isInside(options.root, path)) throw new Error(`Reference escapes the project: ${href}`)
      if (token.type === 'link' && pathname.endsWith('.md')) {
        const pagePath = relative(resolve(options.root, 'pages'), path).split(sep).join('/')
        const route = routeFromCliPage(pagePath)
        if (!route || options.routes.get(route) !== path) throw new Error(`Markdown page not found: ${href}`)
        token.href = withBase(options.base, route === '/' ? '/' : `${route}/`) + suffix
      } else if (pathname.startsWith('/')) {
        token.href = withBase(options.base, pathname) + suffix
      } else {
        const canonical = await realpath(path)
        if (!isInside(options.root, canonical)) throw new Error(`Reference escapes the project: ${href}`)
        if (!isStaticAsset(canonical)) throw new Error(`Unsupported Markdown asset: ${href}. Use public/ for other files.`)
        const projectPath = relative(options.root, canonical).split(sep).join('/')
        const contents = await readFile(canonical)
        assets.set(projectPath, contents)
        token.href = options.assetUrl(projectPath, contents) + suffix
      }
    },
  })
  const body = await parser.parse(source)
  const title = String(metadata.title || headings.find(heading => heading.depth === 1)?.text || 'Untitled')
  const description = String(metadata.description || '')
  const byline = [metadata.author, metadata.date].filter(Boolean).map(value => escapeHtml(String(value))).join(' · ')
  const toc = options.theme === 'primer' && headings.filter(heading => heading.depth === 2).length > 1
    ? `<nav class="md-toc" aria-label="Table of contents"><strong>Contents</strong><ol>${headings.filter(heading => heading.depth === 2).map(heading => `<li><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join('')}</ol></nav>`
    : ''
  const home = options.routes.get('/') !== options.page ? `<a class="md-home" href="${withBase(options.base, '/')}">← Home</a>` : ''
  // Keep the document title first, even when metadata accompanies an authored H1.
  const bylineMarkup = `${description ? `<p class="md-description">${escapeHtml(description)}</p>` : ''}${byline ? `<p class="md-byline">${byline}</p>` : ''}${toc}`
  const content = headings.some(heading => heading.depth === 1)
    ? body.replace(/(<\/h1>)/, match => match + bylineMarkup)
    : `<h1>${escapeHtml(title)}</h1>${bylineMarkup}${body}`
  let styles = ''
  let hasCustomStyles = false
  try { hasCustomStyles = (await stat(resolve(options.root, 'markdown.css'))).isFile() }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (hasCustomStyles) {
    const compiled = await compileProjectModule({
      root: options.root, projectPath: 'markdown.css', moduleUrl: () => '',
      resolveModule: () => '', runtimeModuleUrl: '', assetUrl: options.assetUrl,
      development: options.liveReload, refresh: false, platform: 'server',
    })
    styles += '\n' + compiled.style
    for (const path of compiled.dependencies) assets.set(path, await readFile(resolve(options.root, path)))
  }
  return { title, description, lang: String(metadata.lang || 'en'), markup: `<main class="devjar-markdown">${home}${content}</main>`, styles, assets }
}

export function markdownDocument(page: MarkdownPage, options: {
  base: string, theme: MarkdownTheme, liveReload: boolean, metadataHead: string,
}) {
  const themeStyles = ['base.css', `${options.theme}.css`, 'print.css'].map(filename => (
    `<link rel="stylesheet" href="${withBase(options.base, '/_jar/markdown/' + filename)}"${filename === 'print.css' ? ' media="print"' : ''}>`
  )).join('')
  const customStyles = page.styles ? `<style>${page.styles.replace(/<\/style/gi, '<\\/style')}</style>` : ''
  const reload = options.liveReload ? `<script>const events = new EventSource(${JSON.stringify(withBase(options.base, '/_jar/events'))}); events.addEventListener('change', () => location.reload());</script>` : ''
  return `<!doctype html><html lang="${escapeHtml(page.lang)}" data-md-theme="${options.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)}</title>${page.description ? `<meta name="description" content="${escapeHtml(page.description)}">` : ''}${options.metadataHead}${themeStyles}${customStyles}</head><body>${page.markup}${reload}</body></html>`
}
