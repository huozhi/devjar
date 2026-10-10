import { expect, test } from 'bun:test'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRouteManifest, startBuiltServer } from '../src/cli/index'
import { testCdnModule } from '../scripts/test-cdn'

test('personal example exports saved JSON edits without its playground', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devjar-personal-export-'))
  const cdn = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      return new Response(testCdnModule(new URL(request.url).pathname), {
        headers: { 'Content-Type': 'text/javascript' },
      })
    },
  })
  let server: Awaited<ReturnType<typeof startBuiltServer>> | undefined
  try {
    await cp(join(import.meta.dir, '../examples/personal'), root, {
      recursive: true,
      filter: path => !['dist', 'node_modules'].includes(path.split('/').at(-1)!),
    })
    const dev = await loadRouteManifest(root, {
      liveReload: true, revision: 0, base: '/', moduleUrl: path => '/' + path,
    })
    expect(dev.routes['/playground'].page).toBe('pages/playground.tsx')

    // Simulate saving JSON copied from the editor back to disk.
    const content = JSON.parse(await readFile(join(root, 'content.json'), 'utf8'))
    content.name = 'Casey Testerson'
    content.intro = 'A saved edit from the live playground.'
    await writeFile(join(root, 'content.json'), JSON.stringify(content))
    const child = Bun.spawn([
      process.execPath, join(import.meta.dir, '../src/bin/devjar.ts'),
      'build', root, '--exclude', 'pages/playground.tsx', '--cdn', cdn.url.origin,
    ], { stdout: 'pipe', stderr: 'pipe' })
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(exitCode, stderr).toBe(0)
    // The export must remain usable after the build's CDN goes away.
    cdn.stop(true)
    const output = join(root, 'dist')
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
    expect(Object.keys(manifest.routes).sort()).toEqual(['/', '/404'])
    expect((await readdir(output, { recursive: true })).some(path => path.endsWith('.wasm'))).toBe(false)
    server = await startBuiltServer({ root: output, host: '127.0.0.1', port: 0 })
    expect(server.devjarRuntime).toBe(false)
    const origin = `http://${server.host}:${server.port}`
    const response = await fetch(origin)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<h1>Casey Testerson</h1>')
    expect(html).toContain('<title>Casey Testerson</title>')
    expect(html).toContain(content.intro)
    expect(html).toContain(await readFile(join(root, 'styles.css'), 'utf8'))
    expect(html).not.toContain('href="/playground"')
    expect(html).not.toContain(cdn.url.origin)
    const missing = await fetch(`${origin}/playground`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toContain('Page not found')
    const vendorPaths = [...new Set(html.match(/\/_jar\/vendor\/[a-f0-9]+\/[a-f0-9]+\.js/g))]
    expect(vendorPaths.length).toBeGreaterThan(0)
    for (const path of vendorPaths) expect((await fetch(origin + path)).status).toBe(200)
  } finally {
    await server?.close()
    cdn.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
