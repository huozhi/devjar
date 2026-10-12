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

async function render(root: string, theme: string) {
  const routes = (await discover(root, [])).routes
  return renderMarkdown({ root, page: routes.get('/')!, routes, base: '/preview/',
    theme: markdownTheme(theme), liveReload: false, assetUrl: path => '/preview/assets/' + path })
}

describe('Markdown pages', () => {
  test('renders frontmatter, content, footnotes, local links and assets across themes', async () => {
    const root = await fixture()
    try {
      await writeFile(join(root, 'markdown.css'), ':root { --md-accent: purple; }')
      for (const theme of markdownThemes) {
        const page = await render(root, theme)
        expect(page.title).toBe('A study of light')
        expect(page.markup).toContain('href="/preview/notes/#experiment"')
        expect(page.markup).toContain('Ada Chen · 2026-10-13')
        expect(page.markup).toContain('Measured twice.')
        expect(page.markup).toContain('<div class="md-table"><table>')
        expect(page.markup).toContain('language-js')
        expect([...page.assets.keys()]).toEqual(['assets/plot.svg'])
        expect(page.styles).toContain(':root { --md-accent: purple; }')
        expect(page.markup.includes('aria-label="Table of contents"')).toBe(theme === 'primer')
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

  test('Academic exports its Tufte stylesheet and local fonts', async () => {
    const root = await fixture()
    let server: Awaited<ReturnType<typeof startBuiltServer>> | undefined
    try {
      const result = await buildProject({ root, outDir: 'dist', cdn: 'http://127.0.0.1:1',
        prerender: true, exclude: [], base: '/preview/', theme: 'academic' })
      const html = await readFile(join(result.outDir, 'index.html'), 'utf8')
      expect(await readFile(join(result.outDir, '_jar/markdown/academic.css'), 'utf8')).toContain("@import url('./tufte/tufte.css')")
      expect(await readFile(join(result.outDir, '_jar/markdown/tufte/LICENSE'), 'utf8')).toContain('MIT License')
      server = await startBuiltServer({ root: result.outDir, host: '127.0.0.1', port: 0 })
      const response = await fetch(`http://127.0.0.1:${server.port}/preview/_jar/markdown/tufte/et-book/et-book-roman-line-figures/et-book-roman-line-figures.woff`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('font/woff')
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
    } finally { await server?.close(); await rm(root, { recursive: true, force: true }) }
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
        await expect(render(root, 'studio')).rejects.toThrow(error)
      }
      await writeFile(join(outside, 'plot.svg'), '<svg/>')
      await symlink(join(outside, 'plot.svg'), join(root, 'assets/escape.svg'))
      await writeFile(join(root, 'pages/index.md'), '![Escape](../assets/escape.svg)')
      await expect(render(root, 'studio')).rejects.toThrow('Reference escapes the project')
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
      const page = await render(root, 'editorial')
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
      dev = await startDevServer({ root, host: '127.0.0.1', port: 0, cdn: undefined, base: '/preview/', theme: 'primer' })
      const origin = `http://127.0.0.1:${dev.port}`
      expect(await (await fetch(origin + '/preview/reading/')).text()).toContain('Reading guide')
      const document = await (await fetch(origin + '/preview/')).text()
      expect((await fetch(origin + '/preview/_jar/markdown/primer.css')).status).toBe(200)
      expect(document).toContain('data-md-theme="primer"')
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
})
