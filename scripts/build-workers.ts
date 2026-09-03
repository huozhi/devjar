import { createHash } from 'node:crypto'
import { cp, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bindingDirectory = join(root, 'node_modules/@oxc-transform/binding-wasm32-wasi')
const distDirectory = join(root, 'dist')
const assetsDirectory = join(distDirectory, 'assets')
const stagingDirectory = await mkdtemp(join(tmpdir(), 'devjar-transform-assets-'))

try {
  const result = await Bun.build({
    entrypoints: [
      join(root, 'src/transform-worker.ts'),
      join(bindingDirectory, 'transform.wasi-browser.js'),
      join(bindingDirectory, 'wasi-worker-browser.mjs'),
    ],
    outdir: stagingDirectory,
    naming: '[name]-[hash].[ext]',
    target: 'browser',
    format: 'esm',
    footer: 'export {}',
    plugins: [
      {
        name: 'local-oxc-worker',
        setup(build) {
          build.onLoad({ filter: /transform\.wasi-browser\.js$/ }, async ({ path }) => {
            const source = await Bun.file(path).text()
            const contents = source
              .replace(
                "new URL('./transform.wasm32-wasi.wasm', import.meta.url).href",
                'globalThis.__devjarOxcWasmUrl',
              )
              .replace(
                "new URL('@oxc-transform/binding-wasm32-wasi/wasi-worker-browser.mjs', import.meta.url)",
                'globalThis.__devjarOxcWasiWorkerUrl',
              )

            if (contents === source) {
              throw new Error('Unable to patch Oxc browser asset URLs')
            }

            return { contents, loader: 'js' }
          })
        },
      },
    ],
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error('Unable to build the Devjar transform assets')
  }

  function entryAsset(name: string) {
    const output = result.outputs.find(output => basename(output.path).startsWith(`${name}-`))
    if (!output) throw new Error(`Devjar transform asset is missing: ${name}`)
    return `assets/${basename(output.path)}`
  }

  const wasmSource = join(bindingDirectory, 'transform.wasm32-wasi.wasm')
  const wasm = new Uint8Array(await Bun.file(wasmSource).arrayBuffer())
  const wasmHash = createHash('sha256').update(wasm).digest('hex').slice(0, 8)
  const wasmName = `transform.wasm32-wasi-${wasmHash}.wasm`
  await copyFile(wasmSource, join(stagingDirectory, wasmName))

  const assets = {
    worker: entryAsset('transform-worker'),
    binding: entryAsset('transform.wasi-browser'),
    wasm: `assets/${wasmName}`,
    wasiWorker: entryAsset('wasi-worker-browser'),
  }

  await rm(assetsDirectory, { recursive: true, force: true })
  await mkdir(distDirectory, { recursive: true })
  await cp(stagingDirectory, assetsDirectory, { recursive: true })
  await writeFile(join(distDirectory, 'transform-assets.json'), JSON.stringify(assets))

  const legacyAsset = /^(?:transform-worker|transform\.wasi-browser|wasi-worker-browser)(?:-[a-z0-9]+)?\.js$|^transform\.wasm32-wasi(?:-[a-z0-9]+)?\.wasm$/
  for (const name of await readdir(distDirectory)) {
    if (legacyAsset.test(name)) await rm(join(distDirectory, name))
  }

  for (const output of result.outputs) {
    console.log(`dist/assets/${basename(output.path)} ${output.size} bytes`)
  }
  console.log(`dist/assets/${wasmName} ${wasm.byteLength} bytes`)
} finally {
  await rm(stagingDirectory, { recursive: true, force: true })
}
