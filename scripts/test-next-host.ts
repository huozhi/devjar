import assert from 'node:assert/strict'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, type Browser } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'devjar-next-host-'))
const runFile = promisify(execFile)
let server: ChildProcess | undefined
let browser: Browser | undefined

async function run(command: string, args: string[], cwd: string) {
  return runFile(command, args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
}

async function stop() {
  if (!server || server.exitCode !== null) return
  const child = server
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('exit', () => { clearTimeout(timeout); resolve() })
    child.kill('SIGTERM')
  })
  server = undefined
}

async function start(mode: 'dev' | 'start') {
  server = spawn('node', [join(directory, 'node_modules/next/dist/bin/next'), mode, '--hostname', '127.0.0.1', '--port', '0'], {
    cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  const child = server
  return new Promise<string>((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Next startup timed out: ${output}`)), 60000)
    const capture = (chunk: Buffer) => {
      output += chunk.toString()
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
      if (url && /Ready in/.test(output)) { clearTimeout(timeout); resolve(url) }
    }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Next exited (${code}): ${output}`)) })
  })
}

async function check(url: string) {
  const page = await browser!.newPage()
  page.setDefaultTimeout(60000)
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  if (new URL(url).pathname === '/override') {
    await page.route('**/*.wasm', route => route.abort())
  }
  const response = await page.goto(url)
  assert.equal(response?.status(), 200, await page.locator('body').innerText())
  assert.equal(await page.evaluate(() => crossOriginIsolated), false)
  const preview = page.frameLocator('iframe')
  await preview.getByText('Hello from SWR', { exact: true }).waitFor()
  await preview.getByRole('button', { name: 'Count 0' }).click()
  const source = await page.getByRole('textbox', { name: 'Code' }).inputValue()
  await page.getByRole('textbox', { name: 'Code' }).fill(source.replace('Hello from', 'Edited'))
  await preview.getByText('Edited SWR', { exact: true }).waitFor()
  await preview.getByRole('button', { name: 'Count 1' }).waitFor()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await preview.getByText('Hello from SWR', { exact: true }).waitFor()
  await preview.getByRole('button', { name: 'Count 1' }).waitFor()
  await page.getByRole('button', { name: 'Infinite', exact: true }).click()
  await preview.getByText('page-0', { exact: true }).waitFor()
  await preview.getByRole('button', { name: 'More' }).click()
  await preview.getByText('page-0, page-1', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Subscription', exact: true }).click()
  await preview.getByText('Subscription works', { exact: true }).waitFor()
  assert.equal(await page.getByRole('status').textContent(), '')
  assert.deepEqual(errors, [])
  assert(!requests.some(url => url.includes('transform-assets.json')), 'The browser fetched the default manifest')
  if (new URL(url).pathname === '/override') {
    assert(!requests.some(request => new URL(request).pathname.endsWith('.wasm')), 'Override fetched the default WASM')
    for (const asset of ['worker', 'binding', 'wasm']) {
      assert(requests.some(request => new URL(request).pathname === `/compiler/${asset}`), `Missing explicit ${asset} request`)
    }
  } else {
    assert(!requests.some(request => new URL(request).pathname.startsWith('/compiler/')), 'Default preview used the override route')
  }
  await page.close()
}

try {
  await cp(join(root, 'test/fixtures/next-host'), directory, { recursive: true })
  const packed = await run('npm', ['pack', '--json', '--pack-destination', directory], root)
  const [{ filename }] = JSON.parse(packed.stdout)
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, filename)], directory)
  console.log(`Next.js fixture: ${directory}`)
  browser = await chromium.launch({ headless: true })
  const dev = await start('dev')
  await check(dev)
  await check(`${dev}/override`)
  console.log('Next.js/Turbopack development: default assets, explicit override, SWR subpaths, edits and reset passed.')
  await stop()
  await run('node', [join(directory, 'node_modules/next/dist/bin/next'), 'build'], directory)
  const production = await start('start')
  await check(production)
  await check(`${production}/override`)
  console.log('Next.js/Turbopack production: default assets, explicit override, SWR subpaths, edits and reset passed.')
} finally {
  await browser?.close()
  await stop()
  if (!process.env.DEVJAR_KEEP_NEXT_FIXTURE) await rm(directory, { recursive: true, force: true })
  else console.log(`Kept Next.js fixture: ${directory}`)
}
