import { expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrowserLogPrinter, withEarlyScript } from '../src/cli/browser-log'
import { startDevServer } from '../src/cli/index'
import { startStaticServer } from '../src/cli/static'

test('prints browser errors without the page origin and drops quick repeats', () => {
  const lines: string[] = []
  const print = createBrowserLogPrinter(line => lines.push(line))
  const error = { type: 'error' as const, page: '/report.html',
    message: 'TypeError: x is undefined\n    at render (http://localhost:3000/script.js:3:5)' }
  print(error, 'http://localhost:3000')
  print(error, 'http://localhost:3000')
  print({ type: 'resource', page: '/', message: 'Failed to load img http://localhost:3000/missing.png' }, 'http://localhost:3000')
  expect(lines).toEqual([
    'Browser error on /report.html\n  TypeError: x is undefined\n      at render (/script.js:3:5)',
    'Browser failed to load on /\n  img /missing.png',
  ])
})

test('injects the forwarder before any page script', () => {
  for (const [document, expected] of [
    ['<!doctype html><html lang="en"><head><script src="a.js"></script></head>', '<!doctype html><html lang="en"><head>S<script src="a.js"></script></head>'],
    ['<!doctype html><script src="a.js"></script>', '<!doctype html>S<script src="a.js"></script>'],
    ['<h1>Report</h1>', 'S<h1>Report</h1>'],
  ]) expect(withEarlyScript(document, 'S')).toBe(expected)
})

test('dev servers accept forwarded browser errors', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-browser-log-')))
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  let dev: Awaited<ReturnType<typeof startDevServer>> | undefined
  let preview: Awaited<ReturnType<typeof startStaticServer>> | undefined
  try {
    await mkdir(join(root, 'pages'))
    await writeFile(join(root, 'pages/index.tsx'), 'export default function Page() { return <h1>Home</h1> }')
    await writeFile(join(root, 'report.html'), '<h1>Report</h1>')
    dev = await startDevServer({ root, host: '127.0.0.1', port: 0, cdn: undefined, base: '/preview/' })
    preview = await startStaticServer({ target: { root, entry: 'report.html' }, host: '127.0.0.1', port: 0 })
    for (const [origin, endpoint] of [
      [`http://127.0.0.1:${dev.port}`, '/preview/_jar/log'],
      [`http://127.0.0.1:${preview.port}`, '/_jar/log'],
    ]) {
      const page = await (await fetch(origin + (endpoint === '/_jar/log' ? '/' : '/preview/'))).text()
      expect(page).toContain(`const endpoint = ${JSON.stringify(endpoint)}`)
      const message = `Error: broken ${endpoint}\n    at ${origin}/app.js:1:1`
      const sent = await fetch(origin + endpoint, { method: 'POST', body: JSON.stringify({ type: 'error', message, page: '/' }) })
      expect(sent.status).toBe(204)
      expect(errors).toHaveBeenLastCalledWith(`Browser error on /\n  Error: broken ${endpoint}\n      at /app.js:1:1`)
      expect((await fetch(origin + endpoint, { method: 'POST', body: '{"type":"other"}' })).status).toBe(400)
    }
  } finally {
    errors.mockRestore()
    await dev?.close()
    await preview?.close()
    await rm(root, { recursive: true, force: true })
  }
})
