import { project } from './fixtures'
import assert from 'node:assert/strict'
import { cpus, platform, release, arch } from 'node:os'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { init, parse } from 'es-module-lexer'
import { createPreviewResolver } from '../src/shared/cdn'

// Run after pnpm build. Dependencies are mirrored before measurements; this is
// a local baseline, not an internet/CDN benchmark or a comparison with other tools.
const root = join(import.meta.dir, '..')
const coldSamples = 10
const warmSamples = 50
const warmups = 5
const resolvePreview = createPreviewResolver({ react: '19.2.0', 'react-dom': '19.2.0' })
const scratch = await mkdtemp(join(tmpdir(), 'devjar-benchmark-'))
const mirrored = new Map<string, string>()
const downloads = new Map<string, Promise<void>>()
await init

function cdnPath(url: string) { return `/cdn/${encodeURIComponent(url)}` }
function mirror(url: string): Promise<void> {
  if (downloads.has(url)) return downloads.get(url)!
  const pending = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`Dependency download failed: ${url} (${response.status})`)
    let source = await response.text()
    const children: string[] = []
    const edits = []
    for (const imported of parse(source)[0]) {
      if (!imported.n) continue
      const dependency = new URL(imported.n, url).href
      assert(dependency.startsWith('https://esm.sh/'), `Unexpected dependency: ${dependency}`)
      children.push(dependency)
      edits.push({ start: imported.s, end: imported.e,
        value: imported.d < 0 ? cdnPath(dependency) : JSON.stringify(cdnPath(dependency)) })
    }
    for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end)
    mirrored.set(cdnPath(url), source)
    // Wait outside recursion so cyclic module graphs cannot deadlock.
    for (const child of children) void mirror(child)
  })()
  downloads.set(url, pending)
  return pending
}


function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return { samples: values.length, medianMs: sorted.length % 2 ? sorted[sorted.length >> 1]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], minMs: sorted[0], maxMs: sorted.at(-1), rawMs: values }
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let server: ReturnType<typeof Bun.serve> | undefined
try {
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react-refresh/runtime']) {
    await mirror(resolvePreview(name))
  }
  let count = 0
  while (count !== downloads.size) {
    count = downloads.size
    await Promise.all(downloads.values())
  }
  const fixture = join(scratch, 'host.tsx')
  await writeFile(fixture, `import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DevJar } from 'devjar'
const urls = ${JSON.stringify(Object.fromEntries(['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react-refresh/runtime'].map(name => [name, cdnPath(resolvePreview(name))])))}
const resolveModule = name => {
  if (!urls[name]) throw new Error('Unexpected import: ' + name)
  return location.origin + urls[name]
}
let pending
let error
function App() {
  const [files, setFiles] = useState(null)
  useEffect(() => {
    window.run = files => new Promise((resolve, reject) => {
      if (pending) throw new Error('Benchmark loads must be sequential')
      const started = performance.now()
      const timeout = setTimeout(() => reject(new Error('Preview timed out: ' + error)), 30000)
      pending = status => {
        if (status !== 'ready' && status !== 'failed') return
        clearTimeout(timeout)
        pending = undefined
        if (status === 'failed') reject(new Error(String(error)))
        else resolve(performance.now() - started)
      }
      setFiles(files)
    })
  }, [])
  return files && <DevJar title="Benchmark" files={files} tailwind={false}
    resolveModule={resolveModule} onError={value => { error = value }}
    onStatusChange={status => pending?.(status)} />
}
createRoot(document.getElementById('root')).render(<App />)
`)
  const resources = new Map<string, { body: Uint8Array; type: string }>()
  function add(path: string, body: string | Uint8Array, type: string) {
    resources.set(path, { body: gzipSync(body), type })
  }
  for (const [path, body] of mirrored) add(path, body, 'text/javascript')
  // Bundle the host and DevJar together so hooks share one React instance.
  // Preview dependencies remain separate and retain their development builds.
  const bundled = await Bun.build({ entrypoints: [fixture], target: 'browser', format: 'esm', minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'dependencies', setup(build) {
      build.onResolve({ filter: /^(react|react-dom|devjar|es-module-lexer)(\/.*)?$/ }, args => ({ path: Bun.resolveSync(args.path, root) }))
    } }] })
  if (!bundled.success) throw new AggregateError(bundled.logs, 'Benchmark host build failed')
  add('/host.js', await bundled.outputs[0].text(), 'text/javascript')
  add('/', '<div id="root"></div><script type="module" src="/host.js"></script>', 'text/html')
  const manifest = await Bun.file(join(root, 'dist/transform-assets.json')).json() as Record<string, string>
  for (const path of Object.values(manifest)) add('/' + path, await readFile(join(root, 'dist', path)), path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const resource = resources.get(new URL(request.url).pathname)
    if (!resource) return new Response('Not found', { status: 404 })
    return new Response(resource.body, { headers: { 'content-type': resource.type,
      'content-encoding': 'gzip', 'cache-control': 'public, max-age=31536000' } })
  } })
  browser = await chromium.launch()
  const results = []
  for (const components of [1, 50]) {
    const files = project(components)
    const cold: number[] = []
    const warm: number[] = []
    for (let trial = 0; trial < coldSamples; trial++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      try {
        const page = await context.newPage()
        await page.goto(server.url.href)
        await page.waitForFunction(() => typeof (window as any).run === 'function')
        cold.push(await page.evaluate(files => (window as any).run(files), files))
        assert.equal(await page.frameLocator('iframe').locator('button').count(), components)
        if (trial === coldSamples - 1) {
          const frame = page.frameLocator('iframe')
          await frame.locator('#item-0').click()
          for (let edit = 1; edit <= warmups + warmSamples; edit++) {
            const changed = { ...files, 'components/Item0.tsx': files['components/Item0.tsx'].replace('Revision 0', 'Revision ' + edit) }
            const elapsed = await page.evaluate(files => (window as any).run(files), changed)
            assert.equal(await frame.locator('#item-0').textContent(), `Revision ${edit} Count 1`)
            if (edit > warmups) warm.push(elapsed)
          }
        }
      } finally { await context.close() }
    }
    results.push({ components, files: Object.keys(files).length,
      sourceBytes: Object.values(files).reduce((n, source) => n + Buffer.byteLength(source), 0),
      cold: summarize(cold), warm: summarize(warm) })
    console.error(`${components} components: cold median ${results.at(-1)!.cold.medianMs.toFixed(1)}ms, warm median ${results.at(-1)!.warm.medianMs.toFixed(1)}ms`)
  }
  const runtimePaths = new Set(['index.js'])
  for (const path of runtimePaths) {
    const source = await readFile(join(root, 'dist', path), 'utf8')
    for (const imported of parse(source)[0]) if (imported.n?.startsWith('./')) runtimePaths.add(imported.n.slice(2))
  }
  const sizes = []
  for (const path of [...runtimePaths, ...Object.values(manifest)]) {
    const body = await readFile(join(root, 'dist', path))
    sizes.push({ path, rawBytes: body.length, gzipBytes: gzipSync(body).length })
  }
  const lexer = await readFile(join(root, 'node_modules/es-module-lexer/dist/lexer.js'))
  sizes.push({ path: 'es-module-lexer', rawBytes: lexer.length, gzipBytes: gzipSync(lexer).length })
  const report = { date: new Date().toISOString(), packageVersion: (await Bun.file(join(root, 'package.json')).json()).version, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    environment: { os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0].model, browser: browser.version(), bun: Bun.version,
      hostReact: (await Bun.file(join(root, 'node_modules/react/package.json')).json()).version,
      previewReact: '19.2.0', refresh: '0.17.0', headless: true, throttling: 'none', tailwind: false },
    methodology: 'Local gzip HTTP server; pinned preview dependencies mirrored before timing. Cold: fresh browser context, host loaded before files-to-ready timer. Shared browser process/OS caches may remain. Warm: one component edited serially, state preservation checked, five warmups excluded. Ready is React commit, not paint or application data readiness. Gzip sizes are per-file estimates, not complete application transfers.',
    results, sizes }
  await mkdir(join(root, 'benchmarks'), { recursive: true })
  await writeFile(join(root, 'benchmarks/browser.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  server?.stop(true)
  await rm(scratch, { recursive: true, force: true })
}
