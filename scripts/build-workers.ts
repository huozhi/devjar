import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bindingDirectory = join(root, 'node_modules/@oxc-transform/binding-wasm32-wasi')
const distDirectory = join(root, 'dist')

// Single source of truth for the runtime transform assets. The CLI copies the
// emitted files and the browser runtime builds their URLs from the hashed
// names recorded here.
export type TransformAssetManifest = {
  worker: string
  binding: string
  wasm: string
  wasiWorker: string
}

const result = await Bun.build({
  entrypoints: [
    join(root, 'src/transform-worker.ts'),
    join(bindingDirectory, 'transform.wasi-browser.js'),
    join(bindingDirectory, 'wasi-worker-browser.mjs'),
  ],
  outdir: distDirectory,
  // Content-hash the filenames so the emitted assets are immutable and can be
  // cached forever. The hash is stable for identical content.
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
  process.exit(1)
}

// Content-hash the copied wasm binary with the same scheme Bun uses
// (`name-<hash>.<ext>`), then emit it under the hashed name.
function contentHash(bytes: Buffer | Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10)
}

function hashFileName(fileName: string, hash: string) {
  const { name, ext } = parse(fileName)
  return `${name}-${hash}${ext}`
}

const wasmSourcePath = join(bindingDirectory, 'transform.wasm32-wasi.wasm')
const wasmBytes = await readFile(wasmSourcePath)
const wasmName = hashFileName('transform.wasm32-wasi.wasm', contentHash(wasmBytes))
await copyFile(wasmSourcePath, join(distDirectory, wasmName))

// Map each entrypoint to its emitted (hashed) output file name. Outputs keep
// the entrypoint's name as a stem (`<name>-<hash>.js`), so match on that.
function emittedName(entrypoint: string) {
  const stem = parse(entrypoint).name
  const output = result.outputs.find(o => {
    if (o.kind !== 'entry-point') return false
    const base = parse(o.path).base
    return base === `${stem}.js` || base.startsWith(`${stem}-`)
  })
  if (!output) throw new Error(`Missing build output for ${entrypoint}`)
  return parse(output.path).base
}

const manifest: TransformAssetManifest = {
  worker: emittedName(join(root, 'src/transform-worker.ts')),
  binding: emittedName(join(bindingDirectory, 'transform.wasi-browser.js')),
  wasm: wasmName,
  wasiWorker: emittedName(join(bindingDirectory, 'wasi-worker-browser.mjs')),
}
await writeFile(join(distDirectory, 'transform-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`)

for (const output of result.outputs) {
  console.log(`${output.path.replace(`${root}/`, '')} ${output.size} bytes`)
}
console.log(`dist/${wasmName} ${wasmBytes.byteLength} bytes`)
console.log('dist/transform-assets.json')
