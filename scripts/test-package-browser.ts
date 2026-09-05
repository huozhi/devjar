import assert from 'node:assert/strict'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, firefox, webkit, type Browser, type Page } from '@playwright/test'

const runFile = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'devjar-package-browser-'))
const packageDirectory = join(temporaryRoot, 'package')
const projectRoot = join(temporaryRoot, 'project')
let browser: Browser | undefined
let server: ChildProcess | undefined
let strictServer: ReturnType<typeof Bun.serve> | undefined

function executable(name: string) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

async function run(command: string, args: string[], cwd: string) {
  return runFile(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
}

function serverUrl(child: ChildProcess) {
  return new Promise<string>((resolvePromise, reject) => {
    let output = ''
    let errors = ''
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for the packaged server.${errors ? `\n${errors}` : ''}`))
    }, 10_000)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', chunk => {
      output += chunk
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/\S*/)
      if (!match) return
      clearTimeout(timeout)
      resolvePromise(match[0])
    })
    child.stderr?.on('data', chunk => {
      errors += chunk
    })
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`Packaged server exited with code ${code}.${errors ? `\n${errors}` : ''}`))
    })
  })
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolvePromise => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolvePromise()
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolvePromise()
    })
    child.kill('SIGTERM')
  })
}

async function assertPage(page: Page, heading: string, title: string) {
  await page.waitForFunction(
    expected => document.querySelector('h1')?.textContent === expected.heading
      && document.title === expected.title,
    { heading, title },
  )
  assert.equal(await page.locator('h1').textContent(), heading)
  assert.equal(await page.title(), title)
}

try {
  await mkdir(packageDirectory, { recursive: true })
  await mkdir(join(projectRoot, 'pages/docs'), { recursive: true })
  await mkdir(join(projectRoot, 'assets'), { recursive: true })
  const packed = await run(
    'npm',
    ['pack', '--json', '--pack-destination', packageDirectory],
    root,
  )
  const packResult = JSON.parse(packed.stdout)[0] as { filename: string }
  const tarball = join(packageDirectory, packResult.filename)
  assert((await readFile(tarball)).byteLength > 0, 'npm pack did not create a tarball')

  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({
    private: true,
    dependencies: {
      react: '19.2.0',
      'react-dom': '19.2.0',
    },
  }))
  await writeFile(join(projectRoot, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="4" /></svg>')
  await writeFile(join(projectRoot, 'pages/index.tsx'), `import logo from '../assets/logo.svg'
export default function Page() {
  return <><title>Package home</title><main><h1>Home</h1><img src={logo} alt="Logo" /><a href="/docs/start">Docs</a></main></>
}`)
  await writeFile(join(projectRoot, 'pages/docs/start.tsx'), `export default function Page() {
  return <><title>Package docs</title><main><h1>Docs</h1><a href="/">Home</a></main></>
}`)
  await writeFile(join(projectRoot, 'pages/404.tsx'), `export default function Page() {
  return <><title>Package missing</title><main><h1>Custom 404</h1><a href="/">Home</a></main></>
}`)

  await run('npm', ['install', '--ignore-scripts', tarball], projectRoot)
  const devjar = join(projectRoot, 'node_modules', '.bin', executable('devjar'))
  await run(devjar, ['build', '--base', '/preview/'], projectRoot)
  const builtRuntimeFiles = await readdir(join(projectRoot, 'dist/_jar'))
  assert(!builtRuntimeFiles.includes('runtime.js'))
  assert(!builtRuntimeFiles.includes('transform-assets.json'))
  const builtAssetFiles = await readdir(join(projectRoot, 'dist/_jar/assets'))
  assert.equal(
    builtAssetFiles.filter(file => /^client-[a-f0-9]{10}\.js$/.test(file)).length,
    1,
  )

  server = spawn(devjar, ['start', 'project', '--host', '127.0.0.1', '--port', '0'], {
    cwd: temporaryRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const baseUrl = await serverUrl(server)

  const engine = { chromium, firefox, webkit }[process.env.DEVJAR_TEST_BROWSER || 'chromium']
  if (!engine) throw new Error('Unknown DEVJAR_TEST_BROWSER')
  browser = await engine.launch({ headless: true })
  const page = await browser.newPage()
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const externalRequests: string[] = []
  const builtOrigin = new URL(baseUrl).origin
  page.on('request', request => {
    if (new URL(request.url()).origin !== builtOrigin) externalRequests.push(request.url())
  })
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  await page.addInitScript(`
    globalThis.__devjarRenderCount = 0
    addEventListener('devjar:render', () => globalThis.__devjarRenderCount++)
  `)

  const homeResponse = await page.goto(baseUrl)
  assert.equal(homeResponse?.status(), 200)
  await page.waitForFunction('globalThis.__devjarRenderCount > 0')
  await assertPage(page, 'Home', 'Package home')
  assert.deepEqual(externalRequests, [])
  const vendorUrls = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(url => url.includes('/_jar/vendor/')))
  assert(vendorUrls.length > 0, 'The browser did not load vendored dependencies')
  const vendorResponse = await page.request.get(vendorUrls[0])
  assert.equal(vendorResponse.status(), 200)
  assert.equal(
    vendorResponse.headers()['cache-control'],
    'public, max-age=31536000, immutable',
  )
  const logoPath = await page.locator('img[alt="Logo"]').getAttribute('src')
  assert.match(logoPath || '', /^\/preview\/_jar\/assets\/logo-[a-f0-9]{10}\.svg$/)
  const logoResponse = await page.request.get(new URL(logoPath!, baseUrl).href)
  assert.equal(logoResponse.status(), 200)
  assert.match(logoResponse.headers()['content-type'], /image\/svg\+xml/)
  assert.equal(logoResponse.headers()['cache-control'], 'public, max-age=31536000, immutable')

  const homeRenderCount = await page.evaluate('globalThis.__devjarRenderCount') as number
  await page.locator('a[href="/docs/start"]').click()
  await page.waitForURL(`${baseUrl}docs/start`)
  await page.waitForFunction(
    count => (globalThis as typeof globalThis & { __devjarRenderCount: number })
      .__devjarRenderCount > count,
    homeRenderCount,
  )
  await assertPage(page, 'Docs', 'Package docs')

  const docsRenderCount = await page.evaluate('globalThis.__devjarRenderCount') as number
  await page.goBack()
  await page.waitForURL(baseUrl)
  await page.waitForFunction(
    count => (globalThis as typeof globalThis & { __devjarRenderCount: number })
      .__devjarRenderCount > count,
    docsRenderCount,
  )
  await assertPage(page, 'Home', 'Package home')

  const docsResponse = await page.goto(`${baseUrl}docs/start`)
  assert.equal(docsResponse?.status(), 200)
  await page.waitForFunction('globalThis.__devjarRenderCount > 0')
  await assertPage(page, 'Docs', 'Package docs')
  assert.deepEqual(consoleErrors, [])
  assert.deepEqual(pageErrors, [])

  consoleErrors.length = 0
  const missingResponse = await page.goto(`${baseUrl}missing`)
  assert.equal(missingResponse?.status(), 404)
  await page.waitForFunction('globalThis.__devjarRenderCount > 0')
  await assertPage(page, 'Custom 404', 'Package missing')
  assert(consoleErrors.every(message => message.includes('404 (Not Found)')))
  assert.deepEqual(pageErrors, [])

  // Reuse the package fixture to exercise the browser compiler through DevJar.
  // This catches asset/worker wiring and state preservation that native tests cannot.
  await stopServer(server)
  const source = `import { useEffect, useState } from 'react'
import content from '../content.json'
import text from '../message.txt' with { type: 'text' }
globalThis.__devjarModuleRuns = (globalThis.__devjarModuleRuns || 0) + 1
export default function Counter() {
  const [count, setCount] = useState<number>(0)
  useEffect(() => () => {
    window.parent.__devjarCleanups = (window.parent.__devjarCleanups || 0) + 1
  }, [])
  return <button onClick={() => setCount(count + 1)}>Hello {content.name} {text} {count}</button>
}`
  await writeFile(join(projectRoot, 'pages/playground.tsx'), `import { StrictMode, useMemo, useRef, useState } from 'react'
import { DevJar } from 'devjar'
const initial = ${JSON.stringify(source)}
export default function Playground() {
  const apiRef = useRef(null)
  const [code, setCode] = useState(initial)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [readyCount, setReadyCount] = useState(0)
  const [resetDone, setResetDone] = useState(false)
  const [tailwind, setTailwind] = useState(false)
  const [transform, setTransform] = useState(true)
  const files = useMemo(() => ({ 'pages/index.tsx': code, 'content.json': '{"name":"Devjar"}', 'message.txt': 'works' }), [code])
  return <main>
    <button onClick={() => void apiRef.current?.reset()}>Reset runtime</button>
    <button onClick={() => {
      const first = apiRef.current.reset()
      const second = apiRef.current.reset()
      if (first !== second) throw new Error('Concurrent resets must share a promise')
      setCode(current => current.replace('Latest', 'Reset edit'))
      void first.then(() => setResetDone(true))
    }}>Reset and edit</button>
    <span aria-label="Reset completed">{String(resetDone)}</span>
    <button onClick={() => setTailwind(value => !value)}>Toggle Tailwind</button>
    <button onClick={() => setTransform(value => !value)}>Toggle transform</button>
    <textarea aria-label="Code" value={code} onChange={event => setCode(event.target.value)} />
    <pre role="status">{error}</pre>
    <output aria-label="Preview status" data-ready-count={readyCount}>{status}</output>
    <StrictMode><DevJar title="Live preview" apiRef={apiRef} tailwind={tailwind} transform={transform} dependencies={{ react: '19.2.0', 'react-dom': '19.2.0' }} onStatusChange={status => { setStatus(status); if (status === 'ready') setReadyCount(count => count + 1) }} onError={error => setError(error ? String(error) : '')} files={files} /></StrictMode>
  </main>
}`)
  await run(devjar, ['build', '--base', '/preview/'], projectRoot)
  server = spawn(devjar, ['start', 'project', '--host', '127.0.0.1', '--port', '0'], {
    cwd: temporaryRoot, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const previewUrl = await serverUrl(server)
  const preview = await browser.newPage()
  const previewErrors: string[] = []
  preview.on('pageerror', error => previewErrors.push(error.message))
  const response = await preview.goto(`${previewUrl}playground`)
  assert.equal(response?.headers()['cross-origin-opener-policy'], undefined)
  assert.equal(response?.headers()['cross-origin-embedder-policy'], undefined)
  assert.equal(await preview.evaluate(() => crossOriginIsolated), false)
  const frame = preview.frameLocator('iframe')
  await frame.getByRole('button', { name: 'Hello Devjar works 0' }).click()
  await frame.getByRole('button', { name: 'Hello Devjar works 1' }).waitFor()
  await preview.getByRole('textbox', { name: 'Code' }).fill(source.replace('Hello', 'Updated'))
  await frame.getByRole('button', { name: 'Updated Devjar works 1' }).waitFor()
  await preview.getByRole('textbox', { name: 'Code' }).fill('export default () => <div>')
  await preview.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Unexpected token'))
  await preview.getByRole('textbox', { name: 'Code' }).fill(source.replace('Hello', 'Recovered'))
  await frame.getByRole('button', { name: 'Recovered Devjar works 1' }).waitFor()
  await preview.getByLabel('Preview status').filter({ hasText: 'ready' }).waitFor()
  const cleanupsBeforeReset = await preview.evaluate(() => (window as any).__devjarCleanups || 0)
  await preview.getByRole('button', { name: 'Reset runtime' }).click()
  await frame.getByRole('button', { name: 'Recovered Devjar works 0' }).waitFor()
  assert(await preview.evaluate(() => (window as any).__devjarCleanups) > cleanupsBeforeReset)
  assert.equal(await frame.locator('body').evaluate(() => (window as any).__devjarModuleRuns), 1)
  await preview.getByLabel('Preview status').filter({ hasText: 'ready' }).waitFor()
  await preview.getByRole('textbox', { name: 'Code' }).fill('export default function Broken() { throw new Error("Render failed") }')
  await preview.getByLabel('Preview status').filter({ hasText: 'failed' }).waitFor()
  await preview.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Render failed'))
  await preview.getByRole('textbox', { name: 'Code' }).fill(source)
  await frame.getByRole('button', { name: /^Hello Devjar works \d+$/ }).waitFor()
  await preview.getByLabel('Preview status').filter({ hasText: 'ready' }).waitFor()
  assert.equal(await preview.locator('pre[role="status"]').textContent(), '')
  // Source stays identical while compiler options change: cached raw JSX must
  // not prevent recovery when transformation is re-enabled.
  await preview.getByRole('button', { name: 'Toggle transform' }).click()
  await preview.getByLabel('Preview status').filter({ hasText: 'failed' }).waitFor()
  await preview.getByRole('button', { name: 'Toggle transform' }).click()
  await preview.getByLabel('Preview status').filter({ hasText: 'ready' }).waitFor()

  // Both directions must keep the project usable without editing its files.
  await preview.route('https://unpkg.com/@tailwindcss/browser@4', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
  for (let toggle = 0; toggle < 2; toggle++) {
    const previousReady = await preview.getByLabel('Preview status').getAttribute('data-ready-count')
    await preview.getByRole('button', { name: 'Toggle Tailwind' }).click()
    await preview.waitForFunction(previous => Number(document.querySelector('[aria-label="Preview status"]')?.getAttribute('data-ready-count')) > Number(previous), previousReady)
    await frame.getByRole('button', { name: /^Hello Devjar works \d+$/ }).waitFor()
    await preview.getByLabel('Preview status').filter({ hasText: 'ready' }).waitFor()
  }

  // Hold a real worker request so an error from the visible old preview arrives
  // during compilation. It must not poison readiness of the replacement.
  await preview.evaluate(() => {
    const postMessage = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (...args) {
      Worker.prototype.postMessage = postMessage
      ;(window as any).__releaseCompilation = () => postMessage.apply(this, args as [any])
    }
  })
  await preview.getByRole('textbox', { name: 'Code' }).fill(source.replace('Hello', 'Latest'))
  await preview.waitForFunction(() => typeof (window as any).__releaseCompilation === 'function')
  await preview.evaluate(() => {
    const frameWindow = document.querySelector('iframe')!.contentWindow! as any
    frameWindow.dispatchEvent(new frameWindow.ErrorEvent('error', { message: 'Old preview failed', error: new frameWindow.Error('Old preview failed') }))
    ;(window as any).__releaseCompilation()
    delete (window as any).__releaseCompilation
  })
  await frame.getByRole('button', { name: /^Latest Devjar works \d+$/ }).waitFor()
  await preview.getByLabel('Preview status').filter({ hasText: 'ready' }).waitFor()
  assert.equal(await preview.locator('pre[role="status"]').textContent(), '')
  await preview.getByRole('button', { name: 'Reset and edit' }).click()
  await preview.getByLabel('Reset completed').filter({ hasText: 'true' }).waitFor()
  await frame.getByRole('button', { name: 'Reset edit Devjar works 0' }).waitFor()
  await preview.getByLabel('Preview status').filter({ hasText: 'ready' }).waitFor()
  assert.deepEqual(previewErrors, [])
  // A separate development React root makes Strict Mode's effect replay real;
  // production React in the exported website intentionally does not replay it.
  const strictFiles = { 'pages/index.js': 'export default function Page() { return "Strict preview" }' }
  const strictHtml = `<div id="root"></div><script type="importmap">${JSON.stringify({ imports: {
    react: 'https://esm.sh/react@19.2.0?dev',
    'react/jsx-runtime': 'https://esm.sh/react@19.2.0/jsx-runtime?dev',
    'es-module-lexer': '/lexer.js',
    'react-dom/client': 'https://esm.sh/react-dom@19.2.0/client?dev&deps=react@19.2.0',
  } })}</script><script type="module">
import { createElement, StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DevJar, useDevJar } from '/index.js'
const files = ${JSON.stringify(strictFiles)}
window.effectSetups = 0
window.effectCleanups = 0
function Probe() {
  useEffect(() => {
    window.effectSetups++
    return () => { window.effectCleanups++ }
  }, [])
  return createElement(DevJar, { files, transform: false, tailwind: false,
    onStatusChange: status => { document.body.dataset.status = status } })
}
const hookFiles = { 'pages/index.js': \`import { useEffect } from 'react'
export default function Page() {
  useEffect(() => () => { window.parent.hookCleanups++ }, [])
  return 'Hook preview'
}\` }
window.hookCleanups = 0
function HookProbe() {
  const [visible, setVisible] = useState(false)
  const [version, setVersion] = useState(0)
  const { ref, load, status } = useDevJar({ transform: false, tailwind: false })
  useEffect(() => { void load(hookFiles) }, [load])
  useEffect(() => { document.body.dataset.hookStatus = status }, [status])
  return createElement('div', null,
    createElement('button', { onClick: () => setVisible(value => !value) }, 'Toggle iframe'),
    createElement('button', { onClick: () => setVersion(value => value + 1) }, 'Replace iframe'),
    visible && createElement('iframe', { key: version, ref, title: 'Hook iframe' }))
}
const root = createRoot(document.getElementById('root'))
root.render(createElement(StrictMode, null, createElement(Probe)))
window.unmount = () => root.unmount()
window.showHook = () => root.render(createElement(StrictMode, null, createElement(HookProbe)))
</script>`
  strictServer = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/') return new Response(strictHtml, { headers: { 'content-type': 'text/html' } })
    if (path === '/lexer.js') return new Response(Bun.file(join(projectRoot, 'node_modules/es-module-lexer/dist/lexer.js')))
    return new Response(Bun.file(join(projectRoot, 'node_modules/devjar/dist', path)))
  } })
  const strictPage = await browser.newPage()
  const strictErrors: string[] = []
  strictPage.on('pageerror', error => strictErrors.push(error.message))
  await strictPage.goto(strictServer.url.href)
  await strictPage.frameLocator('iframe').getByText('Strict preview', { exact: true }).waitFor()
  await strictPage.waitForFunction(() => document.body.dataset.status === 'ready')
  assert.equal(await strictPage.evaluate(() => (window as any).effectSetups), 2)
  assert.equal(await strictPage.evaluate(() => (window as any).effectCleanups), 1)
  await strictPage.evaluate(() => (window as any).showHook())
  await strictPage.getByRole('button', { name: 'Toggle iframe' }).waitFor()
  const hookFrame = strictPage.frameLocator('iframe')
  for (const action of ['Toggle iframe', 'Replace iframe']) {
    const cleanups = await strictPage.evaluate(() => (window as any).hookCleanups)
    await strictPage.getByRole('button', { name: action }).click()
    await hookFrame.getByText('Hook preview', { exact: true }).waitFor()
    await strictPage.waitForFunction(() => document.body.dataset.hookStatus === 'ready')
    if (action === 'Replace iframe') {
      assert.equal(await strictPage.evaluate(() => (window as any).hookCleanups), cleanups + 1)
    }
  }
  const cleanups = await strictPage.evaluate(() => (window as any).hookCleanups)
  await strictPage.getByRole('button', { name: 'Toggle iframe' }).click()
  await strictPage.waitForFunction(() => document.body.dataset.hookStatus === 'idle')
  assert.equal(await strictPage.locator('iframe').count(), 0)
  assert.equal(await strictPage.evaluate(() => (window as any).hookCleanups), cleanups + 1)
  await strictPage.getByRole('button', { name: 'Toggle iframe' }).click()
  await hookFrame.getByText('Hook preview', { exact: true }).waitFor()
  await strictPage.evaluate(() => (window as any).unmount())
  assert.equal(await strictPage.evaluate(() => (window as any).effectCleanups), 2)
  assert.deepEqual(strictErrors, [])
  await strictPage.close()
  console.log('Packaged static export and live DevJar compilation, JSON/text imports, Refresh state preservation, and error recovery passed without isolation headers.')

} finally {
  await browser?.close()
  if (server) await stopServer(server)
  strictServer?.stop(true)
  await rm(temporaryRoot, { recursive: true, force: true })
}
