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
