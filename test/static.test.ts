import { expect, test } from 'bun:test'
import { findIgnoredHtml } from '../src/cli/routes'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { startStaticServer, staticTarget } from '../src/cli/static'

async function fixture(files: Record<string, string>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-static-')))
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), contents)
  }
  return root
}

test('resolves HTML files and HTML folders, but not projects', async () => {
  const root = await fixture({
    'output/report.html': '<h1>Report</h1>',
    'output/notes.txt': 'Notes',
    'nested/v1/index.html': '<h1>v1</h1>',
    'project/pages/index.tsx': '',
    'project/pages/report.html': '',
    'project/legacy.html': '',
    'empty/readme.txt': '',
  })
  try {
    expect(await staticTarget(join(root, 'output/report.html'))).toEqual({ root: join(root, 'output'), entry: 'report.html' })
    expect(await staticTarget(join(root, 'output'))).toEqual({ root: join(root, 'output'), entry: undefined })
    expect(await staticTarget(join(root, 'nested'))).toEqual({ root: join(root, 'nested'), entry: undefined })
    // HTML in pages/ is reported so dev and build can point to the right command.
    expect(await findIgnoredHtml(join(root, 'project'))).toEqual(['pages/report.html'])
    for (const path of ['project', 'empty', 'missing']) expect(await staticTarget(join(root, path))).toBeUndefined()
    await expect(staticTarget(join(root, 'output/notes.txt'))).rejects.toThrow('Pass an .html, .tsx, .jsx, or .md file')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects project-only commands and flags for HTML files', async () => {
  const root = await fixture({ 'report.html': '<h1>Report</h1>' })
  const bin = join(import.meta.dir, '../src/bin/devjar.ts')
  try {
    for (const [args, message] of [
      [['build', join(root, 'report.html')], 'build needs a project with pages/'],
      [[join(root, 'report.html'), '--base', '/preview/'], '--base is not available when serving HTML files directly'],
    ] as const) {
      const result = Bun.spawnSync([process.execPath, bin, ...args])
      expect([result.exitCode, result.stderr.toString()]).toEqual([1, expect.stringContaining(message)])
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('takes the next free port unless one is requested', async () => {
  const root = await fixture({ 'report.html': '<h1>Report</h1>' })
  const bin = join(import.meta.dir, '../src/bin/devjar.ts')
  // localhost may resolve to IPv4 or IPv6, so hold port 3000 on both.
  const blockers = await Promise.all(['127.0.0.1', '::1'].map(host => new Promise<ReturnType<typeof createServer>>(resolve => {
    const blocker = createServer()
    blocker.once('error', () => resolve(blocker)).listen(3000, host, () => resolve(blocker))
  })))
  const child = Bun.spawn([process.execPath, bin, join(root, 'report.html')], { stdout: 'pipe', stderr: 'pipe' })
  try {
    const reader = child.stdout.getReader()
    let output = ''
    while (!/Local .*\n/.test(output)) {
      const { value, done } = await reader.read()
      if (done) throw new Error(await new Response(child.stderr).text())
      output += new TextDecoder().decode(value)
    }
    const port = Number(/localhost:(\d+)/.exec(output)![1])
    expect(port).toBeGreaterThan(3000)
    expect(output).toContain(`Port 3000 is in use; using ${port}.`)
    expect(await (await fetch(`http://localhost:${port}/`)).text()).toContain('<h1>Report</h1>')
  } finally {
    child.kill()
    await child.exited
    for (const blocker of blockers) blocker.close()
    await rm(root, { recursive: true, force: true })
  }
}, 10_000)

test('serves an HTML file with its folder as-is and reloads on changes', async () => {
  const root = await fixture({
    'report.html': '<!doctype html><link rel="stylesheet" href="styles.css"><body><h1>Report</h1><script src="script.js"></script></body>',
    'styles.css': 'h1 { color: green; }',
    'script.js': 'document.title = "ready"',
    'data.csv': 'a,b\n1,2\n',
    'my plot.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'v2/index.html': '<h1>v2</h1>',
    'unrelated/notes.html': '<h1>Notes</h1>',
    '.env': 'SECRET=1',
    'node_modules/pkg/index.js': '',
  })
  const outside = await fixture({ 'outside.txt': 'outside' })
  await symlink(join(outside, 'outside.txt'), join(root, 'escape.txt'))
  const server = await startStaticServer({ target: { root, entry: 'report.html' }, host: '127.0.0.1', port: 0 })
  const origin = `http://127.0.0.1:${server.port}`
  try {
    const home = await fetch(origin + '/')
    expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const document = await home.text()
    // The document is unchanged apart from the error forwarder first and live reload last.
    expect(document.replace(/<script>\(\(\) => \{[\s\S]*?\}\)\(\)<\/script>/, '')).toStartWith('<!doctype html><link rel="stylesheet" href="styles.css"><body><h1>Report</h1><script src="script.js"></script>')
    expect(document.indexOf('/_jar/log')).toBeLessThan(document.indexOf('styles.css'))
    expect(document).toMatch(/EventSource\("\/_jar\/events"\)[\s\S]*<\/script><\/body>$/)

    for (const [path, type, body] of [
      ['/styles.css', 'text/css; charset=utf-8', 'h1 { color: green; }'],
      ['/script.js', 'text/javascript; charset=utf-8', 'document.title = "ready"'],
      ['/data.csv', 'text/csv; charset=utf-8', 'a,b\n1,2\n'],
      ['/my%20plot.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ]) {
      const response = await fetch(origin + path)
      expect([path, response.status, response.headers.get('content-type'), await response.text()]).toEqual([path, 200, type, body])
    }
    for (const path of ['/.env', '/node_modules/pkg/index.js', '/escape.txt', '/%2e%2e/outside.txt', '/missing.js', '/%E0%A4%A']) {
      expect([path, (await fetch(origin + path)).status]).toEqual([path, path === '/%E0%A4%A' ? 400 : 404])
    }

    const redirect = await fetch(origin + '/v2?q=1', { redirect: 'manual' })
    expect([redirect.status, redirect.headers.get('location')]).toEqual([308, '/v2/?q=1'])
    expect(await (await fetch(origin + '/v2/')).text()).toContain('<h1>v2</h1>')
    expect(await (await fetch(origin + '/', { method: 'HEAD' })).text()).toBe('')

    // Synchronize with the watcher through SSE before changing a file.
    const controller = new AbortController()
    const events = await fetch(origin + '/_jar/events', { signal: controller.signal })
    const reader = events.body!.getReader()
    await reader.read()
    const nextChange = async () => JSON.parse(/data: (.*)/.exec(new TextDecoder().decode((await reader.read()).value))![1])
    try {
      // Stylesheets are swapped in place; other files reload the page.
      const css = nextChange()
      await writeFile(join(root, 'styles.css'), 'h1 { color: purple; }')
      expect(await css).toEqual({ reload: false, paths: ['/styles.css'] })
      // A single file watches only folders the page loaded, not unrelated ones.
      await writeFile(join(root, 'unrelated/notes.html'), 'changed')
      const script = nextChange()
      await Bun.sleep(100)
      await writeFile(join(root, 'script.js'), 'document.title = "changed"')
      expect(await script).toEqual({ reload: true, paths: ['/script.js'] })
    } finally { controller.abort() }
  } finally {
    await server.close()
    await rm(outside, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
}, 10_000)

test('lists HTML files in a folder without an index page', async () => {
  const root = await fixture({
    'report.html': '<h1>Report</h1>',
    'drafts/v1 <old>.html': '<h1>v1</h1>',
    'styles.css': '',
    '.cache/hidden.html': '',
  })
  const server = await startStaticServer({ target: { root, entry: undefined }, host: '127.0.0.1', port: 0 })
  try {
    const listing = await (await fetch(`http://127.0.0.1:${server.port}/`)).text()
    expect([...listing.matchAll(/<a href="([^"]+)">(.*?)<\/a>/g)].map(match => [match[1], match[2].replace(/<[^>]+>/g, '')]).sort()).toEqual([
      ['drafts/v1%20%3Cold%3E.html', 'drafts/v1 &lt;old&gt;.html'],
      ['report.html', 'report.html'],
    ])
    await writeFile(join(root, 'index.html'), '<h1>Home</h1>')
    expect(await (await fetch(`http://127.0.0.1:${server.port}/`)).text()).toContain('<h1>Home</h1>')
  } finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})
