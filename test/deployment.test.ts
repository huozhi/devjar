import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

describe('Vercel deployment', () => {
  test('builds the static website with cross-origin isolation', async () => {
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

    expect(config.framework).toBeNull()
    expect(config.buildCommand).toBe('pnpm run build:website')
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
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ])
  })
})
