import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkForUpdate, createUpdateHint, isNewerVersion } from '../src/cli/update'

test('update comparison follows semver and never suggests downgrades', () => {
  for (const [candidate, installed, newer] of [
    ['1.0.0', '0.11.0', true],
    ['0.11.0', '1.0.0', false],
    ['1.0.0', '1.0.0', false],
    ['1.0.0+build.2', '1.0.0+build.1', false],
    ['1.0.0-next.10', '1.0.0-next.2', true],
    ['1.0.0-next.2', '1.0.0-next.10', false],
    ['1.0.0', '1.0.0-rc.1', true],
    ['1.0.0-rc.1', '1.0.0', false],
    ['1.0.0-beta', '1.0.0-alpha', true],
    ['1.0.0-beta.1', '1.0.0-beta', true],
    ['1.0.0-beta', '1.0.0-beta.1', false],
    ['1.0.0-beta.a', '1.0.0-beta.1', true],
    ['1.0.0-01', '1.0.0-0', false],
    ['garbage\u001b[31m', '0.11.0', false],
    ['1.0.0', 'unknown', false],
  ] as const) expect(isNewerVersion(candidate, installed)).toBe(newer)
})

test('update checks cache results, separate channels, and handle bad responses quietly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devjar-update-'))
  const requests: string[] = []
  let invalid = false
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      requests.push(new URL(request.url).pathname)
      return new Response(invalid ? 'unavailable' : JSON.stringify({
        version: new URL(request.url).pathname.endsWith('/next') ? '1.0.0-next.10' : '1.0.0',
      }), { status: invalid ? 503 : 200 })
    },
  })
  const messages: string[] = []
  const options = {
    version: '0.11.0', cacheFile: join(root, 'cache/update.json'),
    registry: server.url.origin + '/', notify: (message: string) => { messages.push(message) },
  }
  try {
    await checkForUpdate(options)
    expect(requests).toEqual(['/devjar/latest'])
    expect(messages[0]).toMatchInlineSnapshot(`
"\nDevjar update available: 0.11.0 → 1.0.0
Run npx devjar@latest to use it.

"
`)
    await checkForUpdate(options)
    expect(requests.length).toBe(1)
    expect(messages.length).toBe(2)
    await checkForUpdate({ ...options, version: '2.0.0' })
    expect(messages.length).toBe(2)
    await checkForUpdate({ ...options, version: '1.0.0-next.2' })
    expect(requests.at(-1)).toBe('/devjar/next')
    expect(messages.at(-1)).toMatchInlineSnapshot(`
"\nDevjar update available: 1.0.0-next.2 → 1.0.0-next.10
Run npx devjar@next to use it.

"
`)

    const cached = JSON.parse(await readFile(options.cacheFile, 'utf8'))
    await writeFile(options.cacheFile, JSON.stringify({ ...cached, checkedAt: 0 }))
    await checkForUpdate({ ...options, version: '1.0.0-next.2' })
    expect(requests.length).toBe(3)
    invalid = true
    await writeFile(options.cacheFile, '{broken')
    const count = messages.length
    await checkForUpdate(options)
    await checkForUpdate(options)
    expect(requests.length).toBe(4)
    expect(messages.length).toBe(count)
  } finally {
    server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})

test('slow update requests do not keep the CLI process alive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devjar-update-exit-'))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch() { return new Promise<Response>(() => {}) },
  })
  try {
    const file = join(root, 'check.ts')
    await writeFile(file, `import { checkForUpdate } from ${JSON.stringify(join(import.meta.dir, '../src/cli/update.ts'))}
void checkForUpdate({ version: '0.11.0', cacheFile: ${JSON.stringify(join(root, 'update.json'))}, registry: ${JSON.stringify(server.url.origin + '/')}, notify: console.log })`)
    const child = Bun.spawn([process.execPath, file], { stdout: 'pipe', stderr: 'pipe' })
    const timeout = setTimeout(() => child.kill(), 1000)
    try {
      expect(await child.exited).toBe(0)
      expect(await new Response(child.stderr).text()).toBe('')
    } finally { clearTimeout(timeout) }
  } finally {
    server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})


test('hints are consumed only at the output boundary and late results stay cached', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devjar-update-boundary-'))
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let requested: () => void = () => {}
  const requestStarted = new Promise<void>(resolve => { requested = resolve })
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch() {
      requested()
      await gate
      return Response.json({ version: '1.0.0' })
    },
  })
  const options = { version: '0.11.0', cacheFile: join(root, 'update.json'), registry: server.url.origin + '/' }
  try {
    const takeLateHint = createUpdateHint(options)
    await requestStarted
    // The ready message has printed before the registry responds.
    expect(takeLateHint()).toBeUndefined()
    release()
    let cached = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        cached = JSON.parse(await readFile(options.cacheFile, 'utf8')).version === '1.0.0'
      } catch {}
      if (cached) break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    expect(cached).toBe(true)
    expect(takeLateHint()).toBeUndefined()

    // On the next invocation the cache is available immediately, even for help.
    const takeCachedHint = createUpdateHint(options)
    expect(takeCachedHint()).toMatchInlineSnapshot(`
"\nDevjar update available: 0.11.0 → 1.0.0
Run npx devjar@latest to use it.

"
`)
    expect(takeCachedHint()).toBeUndefined()
  } finally {
    release()
    server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
