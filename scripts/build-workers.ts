import { createHash } from 'node:crypto'
import { cp, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bindingDirectory = join(root, 'compiler/pkg')
if (process.argv.includes('--clean')) await rm(join(root, 'dist'), { recursive: true, force: true })

for (const command of [
  [Bun.which('cargo') ?? join(process.env.CARGO_HOME ?? join(homedir(), '.cargo'), 'bin/cargo'), 'build', '--locked', '--release', '--target', 'wasm32-unknown-unknown'],
  [join(root, 'compiler/tools/bin/wasm-bindgen'), 'target/wasm32-unknown-unknown/release/devjar_browser_compiler.wasm', '--target', 'web', '--out-dir', 'pkg'],
]) {
  const process = Bun.spawn(command, { cwd: join(root, 'compiler'), stdout: 'inherit', stderr: 'inherit' })
  if (await process.exited !== 0) throw new Error('Compiler build failed. Run pnpm run setup:compiler first.')
}
const distDirectory = join(root, 'dist')
const assetsDirectory = join(distDirectory, 'assets')
const stagingDirectory = await mkdtemp(join(tmpdir(), 'devjar-transform-assets-'))

try {
  const result = await Bun.build({
    entrypoints: [
      join(root, 'src/transform-worker.ts'),
      join(bindingDirectory, 'devjar_browser_compiler.js'),
    ],
    outdir: stagingDirectory,
    naming: '[name]-[hash].[ext]',
    target: 'browser',
    format: 'esm',
    minify: true,
    footer: 'export {}',
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

  const wasmSource = join(bindingDirectory, 'devjar_browser_compiler_bg.wasm')
  const wasm = new Uint8Array(await Bun.file(wasmSource).arrayBuffer())
  const wasmHash = createHash('sha256').update(wasm).digest('hex').slice(0, 8)
  const wasmName = `transform-${wasmHash}.wasm`
  await copyFile(wasmSource, join(stagingDirectory, wasmName))

  const assets = {
    worker: entryAsset('transform-worker'),
    binding: entryAsset('devjar_browser_compiler'),
    wasm: `assets/${wasmName}`,
  }

  const generatedDirectory = join(root, 'src/generated')
  await mkdir(generatedDirectory, { recursive: true })
  // Literal asset references survive into the npm entry, allowing host bundlers
  // to discover and emit every compiler file without a runtime JSON fetch.
  const generated = `export function defaultCompilerAssets() {\n  return {\n${Object.entries(assets).map(([key, path]) => `    ${key}Url: new URL('./${path}', import.meta.url),`).join('\n')}\n  }\n}\n`
  const generatedPath = join(generatedDirectory, 'compiler-assets.ts')
  if (!await Bun.file(generatedPath).exists() || await Bun.file(generatedPath).text() !== generated) {
    await writeFile(generatedPath, generated)
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
