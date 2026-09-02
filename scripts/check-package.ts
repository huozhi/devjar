import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = await Bun.file(join(root, 'package.json')).json()
if (packageJson.bin?.devjar !== './dist/bin.js') {
  throw new Error('package.json must expose dist/bin.js as the devjar binary')
}

const cache = mkdtempSync(join(tmpdir(), 'devjar-npm-cache-'))
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.toLowerCase().startsWith('npm_config_')),
)
const result = Bun.spawnSync(['npm', 'pack', '--dry-run', '--json'], {
  cwd: root,
  env: { ...env, npm_config_cache: cache },
  stderr: 'inherit',
})
rmSync(cache, { recursive: true, force: true })

if (result.exitCode !== 0) process.exit(result.exitCode)
const pack = JSON.parse(result.stdout.toString())[0]
const files = new Set<string>(pack.files.map((file: { path: string }) => file.path))
const required = [
  'dist/_cdn.js',
  'dist/bin.js',
  'dist/client.js',
  'dist/index.js',
  'dist/transform-worker.js',
  'dist/transform.wasm32-wasi.wasm',
]
const missing = required.filter(file => !files.has(file))

if (missing.length) {
  throw new Error(`Package is missing required files: ${missing.join(', ')}`)
}

const cli = Bun.spawnSync(['node', 'dist/bin.js', '--version'], { cwd: root })
if (cli.exitCode !== 0 || cli.stdout.toString().trim() !== packageJson.version) {
  throw new Error('The packaged CLI did not report the package version')
}

const help = Bun.spawnSync(['node', 'dist/bin.js', '--help'], { cwd: root })
if (help.exitCode !== 0 || !help.stdout.toString().includes('default: localhost')) {
  throw new Error('The packaged CLI did not advertise localhost as the default host')
}

const cliProject = mkdtempSync(join(tmpdir(), 'devjar-cli-'))
cpSync(join(root, 'examples/basic'), cliProject, { recursive: true })
const build = Bun.spawnSync(['node', 'dist/bin.js', 'build', cliProject], {
  cwd: root,
  stderr: 'inherit',
})
const usedDefaultOutput = existsSync(join(cliProject, 'dist', 'manifest.json'))
const buildOutput = build.stdout.toString()
rmSync(cliProject, { recursive: true, force: true })

if (
  build.exitCode !== 0
  || !usedDefaultOutput
  || !buildOutput.includes('Devjar build complete')
  || !buildOutput.includes('  Output: ')
  || !buildOutput.includes('  Routes: 2')
) {
  throw new Error('The packaged CLI did not report a completed build in dist')
}

console.log(`Package contains the CLI and required runtime assets (${files.size} files total).`)
