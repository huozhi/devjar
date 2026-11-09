import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pageEntry } from '../src/cli/entry'
import { startDevServer } from '../src/cli/index'

async function fixture(files: Record<string, string>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-entry-')))
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), contents)
  }
  return root
}

test('resolves a React or Markdown file to one page in its project', async () => {
  const root = await fixture({
    'loose/chart.tsx': 'export default function Chart() { return null }',
    'loose/notes.md': '# Notes',
    'app/package.json': '{}',
    'app/components/card.tsx': 'export default function Card() { return null }',
    'loose/report.html': '',
  })
  try {
    expect(await pageEntry(join(root, 'loose/chart.tsx'))).toEqual({ root: join(root, 'loose'), entry: 'chart.tsx' })
    expect(await pageEntry(join(root, 'loose/notes.md'))).toEqual({ root: join(root, 'loose'), entry: 'notes.md' })
    // Inside a project, imports such as ../lib keep working and package.json pins versions.
    expect(await pageEntry(join(root, 'app/components/card.tsx'))).toEqual({ root: join(root, 'app'), entry: 'components/card.tsx' })
    for (const path of ['loose/report.html', 'loose/missing.tsx', 'loose']) expect(await pageEntry(join(root, path))).toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('serves one React or Markdown file at / without pages/', async () => {
  const root = await fixture({
    'chart.tsx': "import data from './data.json'\nexport default function Chart() { return <h1>{data.label}</h1> }",
    'data.json': '{"label":"Signups"}',
    'notes.md': '---\ntitle: Notes\n---\n\n# Field notes\n',
  })
  const servers: Awaited<ReturnType<typeof startDevServer>>[] = []
  try {
    for (const entry of ['chart.tsx', 'notes.md']) {
      servers.push(await startDevServer({ root, host: '127.0.0.1', port: 0, cdn: undefined, base: '/', entry }))
    }
    const [react, markdown] = servers.map(server => `http://127.0.0.1:${server.port}`)
    const routes = await (await fetch(react + '/_jar/routes.json')).json()
    expect(Object.keys(routes.routes)).toEqual(['/'])
    expect(routes.routes['/'].page).toBe('chart.tsx')
    expect((await fetch(react + '/')).status).toBe(200)
    const module = await fetch(react + routes.routes['/'].module)
    expect(module.status).toBe(200)
    expect(await module.text()).toContain('/_jar/module?path=data.json')

    const page = await (await fetch(markdown + '/')).text()
    expect(page).toContain('<h1 id="field-notes">Field notes</h1>')
    expect(page).toContain('<title>Notes</title>')
  } finally {
    for (const server of servers) await server.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('build and start point single files to devjar dev', () => {
  const bin = join(import.meta.dir, '../src/bin/devjar.ts')
  for (const command of ['build', 'start']) {
    const result = Bun.spawnSync([process.execPath, bin, command, 'chart.tsx'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain(`${command} needs a project with pages/. Preview a single file with: devjar chart.tsx`)
  }
})

test('a single file watches only the folders it loads', async () => {
  const root = await fixture({
    'chart.tsx': "import data from './lib/data.json'\nexport default function Chart() { return <h1>{data.label}</h1> }",
    'lib/data.json': '{"label":"Signups"}',
    'downloads/notes.md': '# Unrelated',
  })
  const server = await startDevServer({ root, host: '127.0.0.1', port: 0, cdn: undefined, base: '/', entry: 'chart.tsx' })
  const origin = `http://127.0.0.1:${server.port}`
  const controller = new AbortController()
  try {
    const events = await fetch(origin + '/_jar/events', { signal: controller.signal })
    const reader = events.body!.getReader()
    await reader.read()
    // Loading the page module loads lib/data.json, so lib/ is watched from now on.
    const module = await (await fetch(origin + '/_jar/module?path=chart.tsx')).text()
    const dataUrl = /"([^"]*data\.json[^"]*)"/.exec(module)![1]
    expect((await fetch(new URL(dataUrl, origin))).status).toBe(200)
    const next = reader.read()
    // Any Markdown edit reloads a watched project, so this only stays quiet unwatched.
    await writeFile(join(root, 'downloads/notes.md'), '# Changed')
    const quiet = await Promise.race([next.then(() => 'event'), Bun.sleep(300).then(() => 'quiet')])
    expect(quiet).toBe('quiet')
    await writeFile(join(root, 'lib/data.json'), '{"label":"Updated"}')
    expect(new TextDecoder().decode((await next).value)).toContain('event: change')
  } finally {
    controller.abort()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})
