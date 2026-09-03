import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testCdnModule } from './test-cdn'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = await Bun.file(join(root, 'package.json')).json()
if (packageJson.bin?.jar !== './dist/bin.js') {
  throw new Error('package.json must expose dist/bin.js as the jar binary')
}
if (packageJson.engines?.node !== '>=22') {
  throw new Error('package.json must require Node.js 22 or newer')
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
const transformAssets = JSON.parse(
  readFileSync(join(root, 'dist/transform-assets.json'), 'utf8'),
) as Record<string, string>
const required = [
  'dist/bin.js',
  'dist/client.js',
  'dist/http-loader.mjs',
  'dist/index.js',
  'dist/prerender-runner.mjs',
  'dist/transform-assets.json',
  ...Object.values(transformAssets).map(file => `dist/${file}`),
]
const missing = required.filter(file => !files.has(file))
const hasRuntimeChunk = [...files].some(file => /^dist\/[^/]+-[a-z0-9]+\.js$/.test(file))

if (missing.length || !hasRuntimeChunk) {
  if (!hasRuntimeChunk) missing.push('dist/<runtime>-<hash>.js')
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
const cdn = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    return new Response(testCdnModule(new URL(request.url).pathname), {
      headers: { 'Content-Type': 'text/javascript' },
    })
  },
})
const build = Bun.spawn([
  'node',
  'dist/bin.js',
  'build',
  cliProject,
  '--cdn',
  `http://127.0.0.1:${cdn.port}`,
], {
  cwd: root,
  stdout: 'pipe',
  stderr: 'pipe',
})
const [buildOutput, buildError, buildExitCode] = await Promise.all([
  new Response(build.stdout).text(),
  new Response(build.stderr).text(),
  build.exited,
])
cdn.stop(true)
const usedDefaultOutput = existsSync(join(cliProject, 'dist', 'manifest.json'))
const displayedOutput = relative(root, realpathSync(join(cliProject, 'dist')))
rmSync(cliProject, { recursive: true, force: true })

if (
  buildExitCode !== 0
  || !usedDefaultOutput
  || !buildOutput.includes('Devjar build complete')
  || !buildOutput.includes(`Output  ${displayedOutput}`)
  || !buildOutput.includes('Routes\n├── /\n└── /about')
) {
  if (buildError) console.error(buildError)
  throw new Error('The packaged CLI did not report a completed build in dist')
}

console.log(`Package contains the CLI and required runtime assets (${files.size} files total).`)
