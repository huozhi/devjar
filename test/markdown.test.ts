import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renderMarkdown, markdownDocument } from '../src/cli/markdown'
import { markdownTheme, markdownThemes } from '../src/cli/markdown-theme'
import { discover } from '../src/cli/routes'
import { buildProject, startDevServer, startBuiltServer } from '../src/cli/index'

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-markdown-')))
  await mkdir(join(root, 'pages/notes'), { recursive: true })
  await mkdir(join(root, 'assets'))
  await writeFile(join(root, 'assets/plot.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await writeFile(join(root, 'pages/index.md'), `---
title: A study of light
description: Notes on observation
author: Ada Chen
date: 2026-10-13
lang: en
---
# A study of light

Read [the notes](./notes/index.md#experiment).

![Plot](../assets/plot.svg)

## Experiment

A result with a note[^one].

## Results

| Sample | Value |
| --- | --- |
| A | 12 |

\`\`\`js
const value = 12
\`\`\`

[^one]: Measured twice.
`)
  await writeFile(join(root, 'pages/notes/index.md'), '# Notes\n\n[Home](../index.md)\n')
  await writeFile(join(root, 'pages/404.md'), '# Missing page')
  return root
}

async function render(root: string, theme: string, math: boolean) {
  const routes = (await discover(root, [])).routes
  return renderMarkdown({ root, page: routes.get('/')!, routes, base: '/preview/',
    theme: markdownTheme(theme), liveReload: false, math, assetUrl: path => '/preview/assets/' + path })
}

describe('Markdown pages', () => {
  test('renders frontmatter, content, footnotes, local links and assets across themes', async () => {
    const root = await fixture()
    try {
      await writeFile(join(root, 'markdown.css'), ':root { --md-accent: purple; }')
      for (const theme of markdownThemes) {
        const page = await render(root, theme, false)
        expect(page.title).toBe('A study of light')
        expect(page.markup).toContain('href="/preview/notes/#experiment"')
        expect(page.markup).toContain('Ada Chen · 2026-10-13')
        expect(page.markup).toContain('Measured twice.')
        expect(page.markup).toContain('<div class="md-table"><table>')
        expect(page.markup).toContain('language-js')
        expect([...page.assets.keys()]).toEqual(['assets/plot.svg'])
        expect(page.styles).toContain(':root { --md-accent: purple; }')
        expect(page.markup.includes('aria-label="Table of contents"')).toBe(theme === 'github')
        const html = markdownDocument(page, { base: '/preview/', theme, liveReload: false, metadataHead: '' })
        expect(html).toContain(`data-md-theme="${theme}"`)
        expect(html).toContain(`/_jar/markdown/${theme}.css`)
        for (const other of markdownThemes.filter(value => value !== theme)) {
          expect(html).not.toContain(`/_jar/markdown/${other}.css`)
        }
        expect(html).toContain('<meta name="description" content="Notes on observation">')
        expect(html).not.toContain('<script')
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test('reports conflicting routes, invalid metadata and broken or escaping references', async () => {
    const root = await fixture()
    const outside = await mkdtemp(join(tmpdir(), 'devjar-markdown-outside-'))
    try {
      await writeFile(join(root, 'pages/index.tsx'), 'export default function Page() {}')
      await expect(discover(root, [])).rejects.toThrow('Multiple pages resolve to /')
      await rm(join(root, 'pages/index.tsx'))
      for (const [source, error] of [
        ['---\ntitle: [a, b]\n---\n# Hi', 'Frontmatter title must be a string'],
        ['---\ntitle: Hello\n# Hi', 'Unclosed YAML frontmatter'],
        ['[Missing](./missing.md)', 'Markdown page not found'],
        ['![Missing](../assets/missing.svg)', 'ENOENT'],
        ['![Escape](../../../outside.svg)', 'Reference escapes the project'],
      ]) {
        await writeFile(join(root, 'pages/index.md'), source)
        await expect(render(root, 'minimal', false)).rejects.toThrow(error)
      }
      await writeFile(join(outside, 'plot.svg'), '<svg/>')
      await symlink(join(outside, 'plot.svg'), join(root, 'assets/escape.svg'))
      await writeFile(join(root, 'pages/index.md'), '![Escape](../assets/escape.svg)')
      await expect(render(root, 'minimal', false)).rejects.toThrow('Reference escapes the project')
      expect(() => markdownTheme('missing')).toThrow('Unknown Markdown theme')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  test('escapes raw HTML and metadata and disables executable URLs', async () => {
    const root = await fixture()
    try {
      await writeFile(join(root, 'pages/index.md'), `---\ntitle: '<script>alert(1)</script>'\n---\n<script>alert(1)</script>\n\n[Bad](javascript:alert)\n\n![Bad](data:text/html,test)`)
      const page = await render(root, 'editorial', false)
      const html = markdownDocument(page, { base: '/', theme: 'editorial', liveReload: false, metadataHead: '' })
      expect(html).not.toContain('<script>')
      expect(html).not.toContain('javascript:')
      expect(html).not.toContain('data:text/html')
      expect(html).toContain('&lt;script&gt;')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test('exports and serves a Markdown-only site without downloading React', async () => {
    const root = await fixture()
    let dev: Awaited<ReturnType<typeof startDevServer>> | undefined
    let built: Awaited<ReturnType<typeof startBuiltServer>> | undefined
    try {
      await mkdir(join(root, 'public/reading'), { recursive: true })
      await writeFile(join(root, 'public/reading/index.html'), '<h1>Reading guide</h1>')
      const result = await buildProject({ root, outDir: 'dist', cdn: 'http://127.0.0.1:1',
        prerender: true, exclude: [], base: '/preview/', theme: 'editorial', sitemap: 'sitemap.xml' })
      const html = await readFile(join(result.outDir, 'index.html'), 'utf8')
      expect(html).toContain('<h1 id="a-study-of-light">')
      expect(html).not.toContain('<script')
      expect((await readdir(join(result.outDir, '_jar/markdown'))).sort()).toEqual(['base.css', 'editorial.css', 'print.css'])
      expect(html).toMatch(/\/preview\/_jar\/assets\/plot-[a-f0-9]+\.svg/)
      expect(await readFile(join(result.outDir, 'sitemap.xml'), 'utf8')).toContain('/preview/notes/')
      built = await startBuiltServer({ root: result.outDir, host: '127.0.0.1', port: 0 })
      expect((await fetch(`http://127.0.0.1:${built.port}/preview/missing`)).status).toBe(404)
      expect(await (await fetch(`http://127.0.0.1:${built.port}/preview/reading/`)).text()).toContain('Reading guide')
      dev = await startDevServer({ root, host: '127.0.0.1', port: 0, cdn: undefined, base: '/preview/', theme: 'github' })
      const origin = `http://127.0.0.1:${dev.port}`
      expect(await (await fetch(origin + '/preview/reading/')).text()).toContain('Reading guide')
      const document = await (await fetch(origin + '/preview/')).text()
      expect((await fetch(origin + '/preview/_jar/markdown/github.css')).status).toBe(200)
      expect(document).toContain('data-md-theme="github"')
      expect(document).toContain('EventSource("/preview/_jar/events")')
      const asset = document.match(/src="([^\"]+plot\.svg[^\"]*)"/)![1].replace(/&amp;/g, '&')
      expect((await fetch(origin + asset)).status).toBe(200)
      await writeFile(join(root, 'pages/notes/index.md'), '# Updated notes')
      expect(await (await fetch(origin + '/preview/notes')).text()).toContain('Updated notes')
    } finally {
      await dev?.close()
      await built?.close()
      await rm(root, { recursive: true, force: true })
    }
  })
  test('renders opt-in math while preserving code, escaped dollars and plain Markdown', async () => {
    const root = await fixture()
    try {
      await writeFile(join(root, 'pages/index.md'), [
        '# Equations', '', 'Energy is $E = mc^2$.', '', '$$',
        String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`, '$$', '',
        '中文$x^2$也可以。', '', 'Inline code: `$literal$`.', '', '```tex', '$unrendered$', '```', '',
        String.raw`The price is \$5.`,
      ].join('\n'))
      const page = await render(root, 'minimal', true)
      expect(page.hasMath).toBe(true)
      expect(page.markup).toContain('class="katex"')
      expect(page.markup).toContain('<math')
      expect(page.markup).toContain('katex-display')
      expect(page.markup).toContain('中文<span class="katex"')
      expect(page.markup).toContain('也可以。')
      expect(page.markup).toContain('$literal$</code>')
      expect(page.markup).toContain('$unrendered$')
      expect(page.markup).toContain('The price is $5.')
      expect(markdownDocument(page, { base: '/preview/', theme: 'minimal', liveReload: false, metadataHead: '' }))
        .toContain('href="/preview/_jar/math/katex.min.css"')
      const plain = await render(root, 'minimal', false)
      expect(plain.hasMath).toBe(false)
      expect(plain.markup).toContain('$E = mc^2$')
      expect(plain.markup).not.toContain('class="katex"')
      await writeFile(join(root, 'pages/index.md'), '# No formulas')
      expect((await render(root, 'minimal', true)).hasMath).toBe(false)
      await writeFile(join(root, 'pages/index.md'), String.raw`$\unknowncommand{x}$`)
      await expect(render(root, 'minimal', true)).rejects.toThrow('Unable to render pages/index.md')
      await writeFile(join(root, 'pages/index.md'), String.raw`$\href{javascript:alert(1)}{click}$`)
      expect((await render(root, 'minimal', true)).markup).not.toContain('href="javascript:')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test('serves and exports local math styles and fonts only for sites with formulas', async () => {
    const root = await fixture()
    let dev: Awaited<ReturnType<typeof startDevServer>> | undefined
    let built: Awaited<ReturnType<typeof startBuiltServer>> | undefined
    try {
      await writeFile(join(root, 'pages/index.md'), '# Math\n\n$x^2$\n')
      const result = await buildProject({ root, outDir: 'dist', cdn: 'http://127.0.0.1:1',
        prerender: true, exclude: [], base: '/preview/', math: true })
      const html = await readFile(join(result.outDir, 'index.html'), 'utf8')
      expect(html).toContain('class="katex"')
      expect(html).not.toContain('<script')
      built = await startBuiltServer({ root: result.outDir, host: '127.0.0.1', port: 0 })
      dev = await startDevServer({ root, host: '127.0.0.1', port: 0, cdn: undefined, base: '/preview/', math: true })
      for (const port of [built.port, dev.port]) {
        const origin = `http://127.0.0.1:${port}/preview`
        const document = await (await fetch(origin + '/')).text()
        expect(document).toContain('class="katex"')
        const css = await fetch(origin + '/_jar/math/katex.min.css')
        expect(css.status).toBe(200)
        expect(css.headers.get('content-type')).toContain('text/css')
        const font = (await css.text()).match(/url\((fonts\/[^)]+\.woff2)\)/)![1]
        const response = await fetch(origin + '/_jar/math/' + font)
        expect(response.status).toBe(200)
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100)
      }
      const plain = await buildProject({ root, outDir: 'plain', cdn: 'http://127.0.0.1:1',
        prerender: true, exclude: [], base: '/', math: false })
      await expect(readFile(join(plain.outDir, '_jar/math/katex.min.css'))).rejects.toThrow()
    } finally {
      await dev?.close()
      await built?.close()
      await rm(root, { recursive: true, force: true })
    }
  })

})
