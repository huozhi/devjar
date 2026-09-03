import assert from 'node:assert/strict'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, type Browser, type Page } from '@playwright/test'

const runFile = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'devjar-package-browser-'))
const packageDirectory = join(temporaryRoot, 'package')
const projectRoot = join(temporaryRoot, 'project')
let browser: Browser | undefined
let server: ChildProcess | undefined

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
  const jar = join(projectRoot, 'node_modules', '.bin', executable('jar'))
  await run(jar, ['build', '--base', '/preview/'], projectRoot)
  const builtRuntimeFiles = await readdir(join(projectRoot, 'dist/_jar'))
  assert(builtRuntimeFiles.includes('client.js'))
  assert(!builtRuntimeFiles.includes('runtime.js'))
  assert(!builtRuntimeFiles.includes('transform-assets.json'))

  server = spawn(jar, ['start', 'dist', '--host', '127.0.0.1', '--port', '0'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const baseUrl = await serverUrl(server)

  browser = await chromium.launch({ headless: true })
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

  console.log('Packaged CLI vendors dependencies, builds at a subpath, hydrates, navigates, and renders its custom 404 in Chromium without unexpected browser errors.')
} finally {
  await browser?.close()
  if (server) await stopServer(server)
  await rm(temporaryRoot, { recursive: true, force: true })
}
