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
  // React reports a render error twice; CDN frames collapse into one line.
  const reactError = 'TypeError: items is undefined\n    at List (http://localhost:3000/_jar/module?path=list.tsx:4:9)\n'
    + '    at renderWithHooks (https://esm.sh/react-dom@19/client:1:1)\n    at beginWork (https://esm.sh/react-dom@19/client:2:2)'
  print({ type: 'console', page: '/', message: reactError + '\n\nThe above error occurred in the <List> component.' }, 'http://localhost:3000')
  print({ type: 'error', page: '/', message: reactError }, 'http://localhost:3000')
  expect(lines).toEqual([
    'Browser error on /report.html\n  TypeError: x is undefined\n      at render (/script.js:3:5)',
    'Browser failed to load on /\n  img /missing.png',
    'Browser console.error on /\n  TypeError: items is undefined\n      at List (/_jar/module?path=list.tsx:4:9)\n      at … 2 more frames\n  \n  The above error occurred in the <List> component.',
  ])
})

test('injects the forwarder before any page script', () => {
  for (const [document, expected] of [
    ['<!doctype html><html lang="en"><head><script src="a.js"></script></head>', '<!doctype html><html lang="en"><head>S<script src="a.js"></script></head>'],
    ['<!doctype html><script src="a.js"></script>', '<!doctype html>S<script src="a.js"></script>'],
    ['<h1>Report</h1>', 'S<h1>Report</h1>'],
  ]) expect(withEarlyScript(document, 'S')).toBe(expected)
})

test('dev servers accept browser errors only from their own pages', async () => {
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
      // Escape sequences cannot rewrite the terminal.
      const body = JSON.stringify({ type: 'error', message: `\u001b[2J${message}\u0007`, page: '/\u001b]0;title' })
      const sent = await fetch(origin + endpoint, { method: 'POST', headers: { Origin: origin }, body })
      expect(sent.status).toBe(204)
      expect(errors).toHaveBeenLastCalledWith(`Browser error on /]0;title\n  [2JError: broken ${endpoint}\n      at /app.js:1:1`)
      expect((await fetch(origin + endpoint, { method: 'POST', body: '{"type":"other"}' })).status).toBe(400)
      // Another website, or a rebound DNS name pointing at the server, is refused.
      const calls = errors.mock.calls.length
      for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'http://evil.example', Host: 'evil.example' }]) {
        expect((await fetch(origin + endpoint, { method: 'POST', headers, body })).status).toBe(403)
      }
      expect(errors.mock.calls.length).toBe(calls)
    }
  } finally {
    errors.mockRestore()
    await dev?.close()
    await preview?.close()
    await rm(root, { recursive: true, force: true })
  }
})
