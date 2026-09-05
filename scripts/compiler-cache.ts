import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const assets = ['devjar_browser_compiler.js', 'devjar_browser_compiler_bg.wasm']
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')

async function compilerKey(root: string) {
  const inputs = ['scripts/setup-compiler.sh', 'scripts/build-workers.ts', 'scripts/compiler-cache.ts']
  async function visit(directory: string) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) await visit(path)
      else inputs.push(path)
    }
  }
  await visit('compiler/src')
  for (const entry of await readdir(join(root, 'compiler'), { withFileTypes: true })) {
    if (entry.isFile() && /\.(rs|toml|lock)$/.test(entry.name)) inputs.push(`compiler/${entry.name}`)
    if (entry.isDirectory() && entry.name === '.cargo') await visit('compiler/.cargo')
  }
  const hash = createHash('sha256')
  for (const path of inputs.sort()) {
    hash.update(path).update('\0').update(await readFile(join(root, path))).update('\0')
  }
  return hash.digest('hex')
}

// Vercel's static builder persists node_modules, but not compiler/pkg or Cargo's
// build directories. Cache only the platform-independent generated JS and WASM.
export async function ensureCompiler(root: string, build: () => Promise<void>): Promise<boolean> {
  const cache = join(root, 'node_modules/.cache/devjar-compiler')
  const output = join(root, 'compiler/pkg')
  const key = await compilerKey(root)
  let hit = false
  try {
    const manifest = JSON.parse(await readFile(join(cache, 'manifest.json'), 'utf8'))
    hit = manifest?.key === key
    for (const asset of assets) {
      if (!hit) break
      hit = digest(await readFile(join(cache, asset))) === manifest.assets?.[asset]
    }
  } catch (error) {
    hit = false
    if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (hit) {
    await mkdir(output, { recursive: true })
    for (const asset of assets) await copyFile(join(cache, asset), join(output, asset))
    return true
  }

  await build()
  // Do not trust existing output until the build has completed successfully.
  const contents = await Promise.all(assets.map(asset => readFile(join(output, asset))))
  await rm(cache, { recursive: true, force: true })
  await mkdir(cache, { recursive: true })
  for (const [index, asset] of assets.entries()) await writeFile(join(cache, asset), contents[index])
  await writeFile(join(cache, 'manifest.json'), JSON.stringify({
    key,
    assets: Object.fromEntries(assets.map((asset, index) => [asset, digest(contents[index])])),
  }))
  return false
}
