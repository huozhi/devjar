import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createIframeRouteManifest } from '../src/core'
import { buildProject, loadRouteManifest } from '../src/cli/index'
import { testCdnModule } from '../scripts/test-cdn'

const bin = join(import.meta.dir, '../src/bin/devjar.ts')

test('build exclusions remove routes and unused runtime while keeping shared imports and dev routes', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devjar-exclude-')))
  const cdn = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/javascript' })
    response.end(testCdnModule(new URL(request.url!, 'http://localhost').pathname))
  })
  await new Promise<void>(resolve => cdn.listen(0, '127.0.0.1', resolve))
  try {
    await mkdir(join(root, 'pages/drafts'), { recursive: true })
    await mkdir(join(root, 'pages/_internal'), { recursive: true })
    await writeFile(join(root, 'pages/_internal/shared.tsx'), `export const suffix = ' from a private helper'`)
    await writeFile(join(root, 'pages/_scratch.tsx'), `import missing from 'not-a-real-package'; export default missing`)
    await writeFile(join(root, 'pages/index.tsx'), `import { title } from './drafts/shared'; import { suffix } from './_internal/shared'; export default function Home() { return <h1>{title + suffix}</h1> }`)
    await writeFile(join(root, 'pages/drafts/shared.tsx'), `export const title = 'A shared title'; export default function Draft() { throw new Error('Excluded draft rendered') }`)
    await writeFile(join(root, 'pages/drafts/broken.tsx'), `import missing from 'not-a-real-package'; export default missing`)
    await writeFile(join(root, 'pages/drafts-public.tsx'), `export default function Public() { return <h1>Public draft notes</h1> }`)
    await writeFile(join(root, 'pages/playground.tsx'), `import { DevJar } from 'devjar'; export default function Playground() { throw new Error('Excluded playground rendered'); return <DevJar files={{}} /> }`)
    await writeFile(join(root, 'pages/404.tsx'), `export default function Missing() { return <h1>Missing</h1> }`)
    const address = cdn.address() as { port: number }
    const options = { root, outDir: 'dist', cdn: `http://127.0.0.1:${address.port}`, prerender: true, base: '/resume/', exclude: ['pages/playground.tsx', './pages/drafts/'] }
    const result = await buildProject(options)
    expect(result.routes.sort()).toEqual(['/', '/404', '/drafts-public'])
    expect(result.devjarRuntime).toBe(false)
    const manifest = JSON.parse(await readFile(join(result.outDir, 'manifest.json'), 'utf8'))
    const runtimeManifest = JSON.parse(await readFile(join(result.outDir, '_jar/routes.json'), 'utf8'))
    expect(Object.keys(manifest.routes).sort()).toEqual(result.routes)
    expect(runtimeManifest.routes).toEqual(manifest.routes)
    expect(manifest.notFound.page).toBe('pages/404.tsx')
    expect(await readFile(join(result.outDir, 'index.html'), 'utf8')).toContain('<h1>A shared title from a private helper</h1>')
    const output = await readdir(result.outDir, { recursive: true })
    expect(output.some(path => path.endsWith('.wasm'))).toBe(false)
    expect(output.some(path => path.startsWith('playground'))).toBe(false)
    const moduleNames = (await readdir(join(result.outDir, '_jar/modules'))).map(name => Buffer.from(name.slice(0, -3), 'base64url').toString())
    expect(moduleNames).toContain('pages/drafts/shared.tsx')
    expect(moduleNames).toContain('pages/_internal/shared.tsx')
    expect(moduleNames).not.toContain('pages/_scratch.tsx')
    expect(moduleNames).not.toContain('pages/playground.tsx')
    expect(moduleNames).not.toContain('pages/drafts/broken.tsx')

    const dev = await loadRouteManifest(root, { liveReload: true, revision: 0, base: '/', moduleUrl: path => '/' + path })
    expect(dev.routes['/_scratch']).toBeUndefined()
    expect(dev.routes['/_internal/shared']).toBeUndefined()
    expect(dev.routes['/playground'].page).toBe('pages/playground.tsx')
    expect(dev.routes['/drafts/broken'].page).toBe('pages/drafts/broken.tsx')

    // Exercise repeated flags through the CLI, including exclusion of the 404.
    const child = Bun.spawn([process.execPath, bin, 'build', root, '--cdn', options.cdn, '--out-dir', 'cli-dist',
      '--exclude', 'pages/playground.tsx', '--exclude', 'pages/drafts', '--exclude', 'pages/404.tsx'], { stdout: 'pipe', stderr: 'pipe' })
    const stderr = await new Response(child.stderr).text()
    expect(await child.exited, stderr).toBe(0)
    const cliManifest = JSON.parse(await readFile(join(root, 'cli-dist/manifest.json'), 'utf8'))
    expect(Object.keys(cliManifest.routes).sort()).toEqual(['/', '/drafts-public'])
    expect(cliManifest.notFound).toBeUndefined()

    await writeFile(join(result.outDir, 'keep.txt'), 'Previous build')
    for (const [exclude, message] of [
      [['pages/index.tsx', 'pages/playground.tsx', 'pages/drafts'], 'No index page'],
      [['pages/typo.tsx'], 'Exclude path not found'],
      [['../outside'], 'inside pages/'],
    ] as const) {
      await expect(buildProject({ ...options, exclude: [...exclude] })).rejects.toThrow(message)
      expect(await readFile(join(result.outDir, 'keep.txt'), 'utf8')).toBe('Previous build')
    }
  } finally {
    await new Promise<void>(resolve => cdn.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

test('exclude is build-only and requires a value', () => {
  for (const command of ['dev', 'start']) {
    const result = Bun.spawnSync([process.execPath, bin, command, '--exclude', 'pages/playground.tsx'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('--exclude is only available for build')
  }
  const missing = Bun.spawnSync([process.execPath, bin, 'build', '--exclude'])
  expect(missing.exitCode).toBe(1)
  expect(missing.stderr.toString()).toContain('Missing value for --exclude')
})


test('underscore-prefixed files and directories are not iframe routes', () => {
  const manifest = createIframeRouteManifest({
    'pages/index.tsx': '',
    'pages/_layout.tsx': '',
    'pages/_404.tsx': '',
    'pages/_drafts/index.tsx': '',
    'pages/docs/_helpers.tsx': '',
    'pages/docs/_private/index.tsx': '',
    'pages/my_notes.tsx': '',
  })
  expect(manifest.routes).toEqual({ '/': '@pages/index.tsx', '/my_notes': '@pages/my_notes.tsx' })
  expect(manifest.notFound).toBeUndefined()
})
