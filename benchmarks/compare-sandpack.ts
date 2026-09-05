import assert from 'node:assert/strict'
import { cpus, platform, release, arch } from 'node:os'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { project } from './fixtures'

const root = join(import.meta.dir, '..')
const scratch = await mkdtemp(join(tmpdir(), 'devjar-sandpack-'))
const version = '2.19.8'
const coldSamples = Number(process.env.BENCHMARK_COLD_SAMPLES || 5)
const warmSamples = Number(process.env.BENCHMARK_WARM_SAMPLES || 30)
const warmups = 5
for (const value of [coldSamples, warmSamples]) assert(Number.isInteger(value) && value > 0)
const unchanged = await Promise.all(['package.json', 'pnpm-lock.yaml'].map(path => readFile(join(root, path), 'utf8')))
function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return { median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], samples }
}
const hostHarness = `
let pending
window.addEventListener('message', event => {
  if (event.data?.type === 'devjar-benchmark-commit' && event.data.revision === pending?.revision) {
    const request = pending
    pending = undefined
    clearTimeout(request.timeout)
    request.resolve({ ms: performance.now() - request.started, count: event.data.count })
  }
})
function measure(files, revision) {
  return new Promise((resolve, reject) => {
    if (pending) throw new Error('Loads must be sequential')
    pending = { resolve, revision, started: performance.now(), timeout: setTimeout(() => {
      pending = undefined
      reject(new Error('Preview commit timed out'))
    }, 60000) }
    update(files)
  })
}
window.start = measure
`
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let server: ReturnType<typeof Bun.serve> | undefined
try {
  const child = Bun.spawn(['npm', 'install', '--prefix', scratch, '--no-save', '--no-package-lock', '--ignore-scripts',
    '--no-audit', '--no-fund', `@codesandbox/sandpack-client@${version}`], { stdout: 'inherit', stderr: 'inherit' })
  assert.equal(await child.exited, 0)
  assert.equal((await Bun.file(join(scratch, 'node_modules/@codesandbox/sandpack-client/package.json')).json()).version, version)
  const dependencies = { react: '19.2.0', 'react-dom': '19.2.0' }
  const entry = `import React from 'react'; import { createRoot } from 'react-dom/client';
import App from './pages/index'; createRoot(document.getElementById('root')).render(<App />);`
  const adapters = {
    devjar: `import { useEffect, useState } from 'react'; import { createRoot } from 'react-dom/client';
import { DevJar } from 'devjar';
let update
function Host() {
  const [files, setFiles] = useState(null)
  useEffect(() => { update = setFiles; window.hostReady = true }, [])
  return files && <DevJar files={files} dependencies={${JSON.stringify(dependencies)}} tailwind={false} />
}
createRoot(document.getElementById('host')).render(<Host />)
${hostHarness}`,
    sandpack: `import { SandpackRuntime } from '@codesandbox/sandpack-client/clients/runtime'
let client
function update(files) {
  const setup = { files: Object.fromEntries(Object.entries(files).map(([name, code]) => ['/' + name, { code } ])),
    dependencies: ${JSON.stringify(dependencies)}, entry: '/index.tsx', template: 'create-react-app' }
  setup.files['/index.tsx'] = { code: ${JSON.stringify(entry)} }
  setup.files['/public/index.html'] = { code: '<div id="root"></div>' }
  if (client) client.updateSandbox(setup)
  else {
    const iframe = document.createElement('iframe')
    document.getElementById('host').append(iframe)
    client = new SandpackRuntime(iframe, setup, { showOpenInCodeSandbox: false, showErrorScreen: true,
      showLoadingScreen: false, clearConsoleOnFirstCompile: false })
    client.listen(message => {
      if (['error', 'fatal-error', 'action'].includes(message.type)) console.log('Sandpack message', JSON.stringify(message))
    })
  }
}
window.hostReady = true
${hostHarness}`,
  }
  const resources = new Map<string, { body: Uint8Array; type: string }>()
  function add(path: string, body: string | Uint8Array, type: string) {
    resources.set(path, { body: gzipSync(body), type })
  }
  for (const [name, source] of Object.entries(adapters)) {
    const fixture = join(scratch, `${name}.tsx`)
    await writeFile(fixture, source)
    const built = await Bun.build({ entrypoints: [fixture], target: 'browser', format: 'esm', minify: true,
      define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'dependencies', setup(build) {
        build.onResolve({ filter: /^(react|react-dom|devjar|es-module-lexer)(\/.*)?$/ }, args => ({ path: Bun.resolveSync(args.path, root) }))
        build.onResolve({ filter: /^@codesandbox\/sandpack-client/ }, args => ({ path: Bun.resolveSync(args.path, scratch) }))
      } }] })
    if (!built.success) throw new AggregateError(built.logs, 'Adapter build failed')
    add(`/${name}.js`, await built.outputs[0].text(), 'text/javascript')
    add(`/${name}`, `<div id="host"></div><script type="module" src="/${name}.js"></script>`, 'text/html')
  }
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
    files['components/Item0.tsx'] = files['components/Item0.tsx'].replace('{ useState }', '{ useState, useLayoutEffect }')
      .replace('  const values:', `  const revision = 0
  useLayoutEffect(() => { window.top!.postMessage({ type: 'devjar-benchmark-commit', revision, count }, '*') })
  const values:`)
    const measurements = Object.fromEntries(['devjar', 'sandpack'].map(name => [name, { name, components,
      projectFiles: Object.keys(files).length, coldMs: [] as number[], warmMs: [] as number[],
      statePreserved: [] as boolean[], traffic: [] as unknown[] }]))
    // Alternate order to reduce bias from always testing one runtime first.
    for (let trial = 0; trial < coldSamples; trial++) for (const name of trial % 2 ? ['sandpack', 'devjar'] : ['devjar', 'sandpack']) {
      const result = measurements[name]
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      const traffic: { url: string; bytes: number | null; failure?: string }[] = []
      const reads: Promise<void>[] = []
      let recording = true
      context.on('requestfinished', request => {
        if (!recording) return
        reads.push(request.sizes().then(sizes => { traffic.push({ url: request.url(), bytes: sizes.responseBodySize + sizes.responseHeadersSize }) },
          () => { traffic.push({ url: request.url(), bytes: null }) }))
      })
      context.on('requestfailed', request => { if (recording) traffic.push({ url: request.url(), bytes: null, failure: request.failure()?.errorText }) })
      try {
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error' || message.text().startsWith('Sandpack message')) errors.push(message.text()) })
        await page.goto(new URL(name, server.url).href)
        await page.waitForFunction(() => (window as any).hostReady)
        const initial = await page.evaluate(files => (window as any).start(files, 0), files).catch(error => { throw new Error(`${name}: ${error.message}\n${errors.slice(-8).join('\n')}`) })
        result.coldMs.push(initial.ms)
        const frame = page.frameLocator('iframe')
        assert.equal(await frame.locator('button[id^="item-"]').count(), components)
        await page.waitForTimeout(1000) // Only payload accounting extends beyond commit.
        recording = false
        await Promise.all(reads)
        result.traffic.push({ totalKnownBytes: traffic.reduce((n, entry) => n + (entry.bytes || 0), 0),
          missingSizes: traffic.filter(entry => entry.bytes === null).length, requests: traffic })
        if (trial === coldSamples - 1) {
          await frame.locator('#item-0').click()
          await frame.locator('#item-0').filter({ hasText: 'Count 1' }).waitFor()
          for (let edit = 1; edit <= warmups + warmSamples; edit++) {
            const changed = { ...files, 'components/Item0.tsx': files['components/Item0.tsx']
              .replace('Revision 0', `Revision ${edit}`).replace('const revision = 0', `const revision = ${edit}`) }
            const updated = await page.evaluate(({ files, revision }) => (window as any).start(files, revision), { files: changed, revision: edit })
            assert((await frame.locator('#item-0').textContent())?.startsWith(`Revision ${edit} Count `))
            if (edit > warmups) { result.warmMs.push(updated.ms); result.statePreserved.push(updated.count === 1) }
          }
        }
        console.error(`${name}, ${components} components, cold ${trial + 1}: ${initial.ms.toFixed(1)} ms`)
      } finally { await context.close() }
    }
    for (const measurement of Object.values(measurements)) results.push({ ...measurement,
      cold: summarize(measurement.coldMs), warm: summarize(measurement.warmMs) })
  }
  const report = { date: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    environment: { os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0].model, chromium: browser.version(), bun: Bun.version,
      previewReact: '19.2.0', sandpack: version, headless: true, tailwind: false, throttling: 'none' },
    methodology: 'Preview-only adapters; same TSX projects, layout-effect postMessage commit marker, 5 warmups, alternating runtime order. Cold uses fresh browser contexts after host load, with default remote dependency/bundler services. Network conditions are uncontrolled. Payload includes host plus preview requests completed through 1s after initial commit; worker/service-worker visibility and missing sizes limit accounting. No editor UI, no paint timing. Sandpack requires an additional entrypoint and HTML file. Not comparable to the local-only browser.json baseline.',
    results }
  await writeFile(join(root, 'benchmarks/sandpack.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(results.map(({ name, components, cold, warm, statePreserved }) => ({ name, components,
    coldMedian: cold.median, warmMedian: warm.median, warmP95: warm.p95, statePreserved: statePreserved.every(Boolean) })), null, 2))
} finally {
  await browser?.close()
  server?.stop(true)
  await rm(scratch, { recursive: true, force: true })
  for (const [index, name] of ['package.json', 'pnpm-lock.yaml'].entries()) assert.equal(await readFile(join(root, name), 'utf8'), unchanged[index])
}
