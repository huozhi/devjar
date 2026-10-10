import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    const build = Bun.spawn([process.execPath, bin, 'build', root,
      '--cdn', cdnUrl, '--origin', 'https://example.com', '--base', '/preview/',
      '--exclude', 'pages/draft.tsx', '--sitemap'], { stdout: 'pipe', stderr: 'pipe' })
    const stderr = await new Response(build.stderr).text()
    expect(await build.exited, stderr).toBe(0)
    expect(await readFile(join(root, 'dist/sitemap.xml'), 'utf8')).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/preview/</loc></url>
        <url><loc>https://example.com/preview/guides/about/</loc></url>
      </urlset>
      "
    `)

    const invalid = Bun.spawn([process.execPath, bin, 'build', root,
      '--cdn', cdnUrl, '--sitemap=../escape.xml'], { stdout: 'pipe', stderr: 'pipe' })
    expect(await invalid.exited).toBe(1)
    expect(await new Response(invalid.stderr).text())
      .toContain('Sitemap filename must be a .xml file')
  } finally {
    await new Promise<void>(resolve => cdn.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

test('sitemap is only available for build', () => {
  for (const command of ['dev', 'start']) {
    const result = Bun.spawnSync([process.execPath, bin, command, '--sitemap'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('--sitemap is only available for build')
  }
})
