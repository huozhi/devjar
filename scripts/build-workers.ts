import { copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bindingDirectory = join(root, 'node_modules/@oxc-transform/binding-wasm32-wasi')

const result = await Bun.build({
  entrypoints: [
    join(root, 'src/transform-worker.ts'),
    join(bindingDirectory, 'transform.wasi-browser.js'),
    join(bindingDirectory, 'wasi-worker-browser.mjs'),
  ],
  outdir: join(root, 'dist'),
  naming: '[name].[ext]',
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

await copyFile(
  join(bindingDirectory, 'transform.wasm32-wasi.wasm'),
  join(root, 'dist/transform.wasm32-wasi.wasm'),
)

for (const output of result.outputs) {
  console.log(`${output.path.replace(`${root}/`, '')} ${output.size} bytes`)
}
