import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureCompiler } from '../scripts/compiler-cache'

describe('Vercel deployment', () => {
  test('builds the static website without requiring isolation headers', async () => {
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

    expect(config.framework).toBeNull()
    expect(config.buildCommand).toBe('bun scripts/build-vercel.ts')
    expect(config.outputDirectory).toBe('site/dist')
    expect(config.headers).toEqual([
      {
        source: '/_jar/assets/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_jar/vendor/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_jar/runtime-(.*).js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ])
  })
})

test('deployment cache skips unchanged compiler builds and invalidates compiler inputs or damaged assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devjar-compiler-cache-'))
  const output = join(root, 'compiler/pkg')
  const cache = join(root, 'node_modules/.cache/devjar-compiler')
  const wasm = 'devjar_browser_compiler_bg.wasm'
  let builds = 0
  async function build() {
    builds++
    await mkdir(output, { recursive: true })
    await writeFile(join(output, 'devjar_browser_compiler.js'), `binding ${builds}`)
    await writeFile(join(output, wasm), `wasm ${builds}`)
  }
  try {
    for (const directory of ['compiler/src', 'scripts', 'src']) await mkdir(join(root, directory), { recursive: true })
    const inputs = ['compiler/src/lib.rs', 'compiler/Cargo.toml', 'compiler/Cargo.lock', 'compiler/rust-toolchain.toml',
      'scripts/setup-compiler.sh', 'scripts/build-workers.ts', 'scripts/compiler-cache.ts']
    for (const input of inputs) await writeFile(join(root, input), 'original')
    expect(await ensureCompiler(root, build)).toBe(false)
    expect(builds).toBe(1)

    // A new checkout restores only node_modules, not generated compiler outputs.
    await rm(output, { recursive: true })
    await writeFile(join(root, 'src/core.ts'), 'runtime edit')
    await writeFile(join(root, 'src/transform-worker.ts'), 'worker edit')
    expect(await ensureCompiler(root, build)).toBe(true)
    expect(builds).toBe(1)
    expect(await readFile(join(output, wasm), 'utf8')).toBe('wasm 1')

    for (const input of inputs) {
      await writeFile(join(root, input), 'changed')
      expect(await ensureCompiler(root, build)).toBe(false)
      expect(await ensureCompiler(root, build)).toBe(true)
    }
    await writeFile(join(root, 'compiler/src/extra.rs'), 'new module')
    expect(await ensureCompiler(root, build)).toBe(false)
    await rm(join(root, 'compiler/src/extra.rs'))
    expect(await ensureCompiler(root, build)).toBe(false)

    for (const damage of [
      () => rm(join(cache, wasm)),
      () => writeFile(join(cache, wasm), 'corrupt'),
      () => writeFile(join(cache, 'manifest.json'), '{'),
    ]) {
      await damage()
      expect(await ensureCompiler(root, build)).toBe(false)
    }
    await writeFile(join(root, 'compiler/src/lib.rs'), 'broken')
    await expect(ensureCompiler(root, async () => { throw new Error('compile failed') })).rejects.toThrow('compile failed')
    expect(await ensureCompiler(root, build)).toBe(false)
    expect(await ensureCompiler(root, build)).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
