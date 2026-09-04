import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { init, parse } from 'es-module-lexer'
import { vendorModules } from '../src/cli/vendor'

describe('production dependency vendoring', () => {
  test('copies and rewrites transitive modules and assets', async () => {
    const server = createServer((request, response) => {
      const path = new URL(request.url || '/', 'http://localhost').pathname
      if (path === '/entry') {
        response.writeHead(302, { Location: '/entry.js' })
        response.end()
        return
      }
      const resources: Record<string, { type: string, body: string | Buffer }> = {
        '/entry.js': {
          type: 'text/javascript',
          body: `import { value } from './dependency.js'
import sheet from './style.css' with { type: 'css' }
export { value, sheet }
export const load = () => import('./dynamic.js')
export const worker = new URL('./worker.js', import.meta.url)
//# sourceMappingURL=entry.js.map`,
        },
        '/dependency.js': {
          type: 'text/javascript',
          body: `import './cycle.js'
export const value = 1`,
        },
        '/cycle.js': { type: 'text/javascript', body: `import './dependency.js'` },
        '/dynamic.js': { type: 'text/javascript', body: `export default 'dynamic'` },
        '/worker.js': { type: 'text/javascript', body: `import './worker-dependency.js'` },
        '/worker-dependency.js': { type: 'text/javascript', body: `export const ready = true` },
        '/style.css': { type: 'text/css', body: `.logo { background: url('./logo.png') }` },
        '/logo.png': { type: 'image/png', body: Buffer.from('logo') },
      }
      const resource = resources[path]
      if (!resource) {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, { 'Content-Type': resource.type })
      response.end(resource.body)
    })
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolvePromise)
    })
    const address = server.address() as import('node:net').AddressInfo
    const origin = `http://127.0.0.1:${address.port}`
    const output = await mkdtemp(join(tmpdir(), 'devjar-vendor-'))

    try {
      const vendored = await vendorModules({
        load: url => fetch(url),
        moduleUrls: [`${origin}/entry`],
        resolveModule: specifier => `${origin}/${specifier}`,
      })
      const entryUrl = vendored.moduleUrl(`${origin}/entry`, '/docs/')
      expect(entryUrl).toMatch(/^\/docs\/_jar\/vendor\/[a-f0-9]{12}\/[a-f0-9]{12}\.js$/)
      await vendored.write(output, '/docs/')

      const revisions = await readdir(output)
      expect(revisions).toHaveLength(1)
      const files = await readdir(join(output, revisions[0]))
      expect(files).toHaveLength(8)
      expect(files.some(file => file.endsWith('.css'))).toBe(true)
      expect(files.some(file => file.endsWith('.png'))).toBe(true)
      const sourceFiles = files.filter(file => file.endsWith('.js') || file.endsWith('.css'))
      const sources = await Promise.all(sourceFiles
        .map(file => readFile(join(output, revisions[0], file), 'utf8')))
      await init
      for (const [index, source] of sources.entries()) {
        if (sourceFiles[index].endsWith('.js')) expect(() => parse(source)).not.toThrow()
      }
      const source = sources.join('\n')
      expect(source).not.toContain(origin)
      expect(source).not.toContain(`from './`)
      expect(source).not.toContain(`import('./`)
      expect(source).not.toContain(`url('./`)
      expect(source).not.toContain('sourceMappingURL')
      expect(source).toContain('/docs/_jar/vendor/')
    } finally {
      await new Promise<void>(resolvePromise => server.close(() => resolvePromise()))
      await rm(output, { recursive: true, force: true })
    }
  })
})
