import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildProject } from '../src/cli/index'
import { testCdnModule } from '../scripts/test-cdn'

const bin = join(import.meta.dir, '../src/bin/devjar.ts')

test('build exports a sitemap of public routes with the configured origin and base', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devjar-sitemap-'))
  const cdn = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/javascript' })
    response.end(testCdnModule(new URL(request.url!, 'http://localhost').pathname))
  })
  await new Promise<void>(resolve => cdn.listen(0, '127.0.0.1', resolve))
  try {
    await mkdir(join(root, 'pages/guides'), { recursive: true })
    for (const page of ['index', 'guides/about', 'draft', '404']) {
      await writeFile(join(root, `pages/${page}.tsx`), `export default function Page() { return <h1>${page}</h1> }`)
    }
    const cdnUrl = `http://127.0.0.1:${(cdn.address() as { port: number }).port}`
    const build = async (flag: string, outDir: string) => {
      const child = Bun.spawn([process.execPath, bin, 'build', root,
        '--cdn', cdnUrl, '--origin', 'https://example.com', '--base', '/preview/',
        '--exclude', 'pages/draft.tsx', '--out-dir', outDir, flag], { stdout: 'pipe', stderr: 'pipe' })
      const stderr = await new Response(child.stderr).text()
      expect(await child.exited, stderr).toBe(0)
    }

    await build('--sitemap', 'default-dist')
    expect(await readFile(join(root, 'default-dist/sitemap.xml'), 'utf8')).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/preview/</loc></url>
        <url><loc>https://example.com/preview/guides/about/</loc></url>
      </urlset>
      "
    `)

    await build('--sitemap=pages.xml', 'custom-dist')
    expect(await readFile(join(root, 'custom-dist/pages.xml'), 'utf8'))
      .toBe(await readFile(join(root, 'default-dist/sitemap.xml'), 'utf8'))

    await expect(buildProject({
      root, outDir: 'invalid-dist', cdn: cdnUrl, prerender: true,
      exclude: [], base: '/', sitemap: '../escape.xml',
    })).rejects.toThrow('Sitemap filename must be a .xml file')
  } finally {
    await new Promise<void>(resolve => cdn.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)

test('sitemap is only available for build', () => {
  for (const command of ['dev', 'start']) {
    const result = Bun.spawnSync([process.execPath, bin, command, '--sitemap'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('--sitemap is only available for build')
  }
})
