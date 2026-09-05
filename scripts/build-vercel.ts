import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureCompiler } from './compiler-cache'
import { writeVercelOutput } from './vercel-output'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function run(args: string[], cacheHit: boolean) {
  const child = Bun.spawn(args, {
    cwd: root,
    env: { ...process.env, DEVJAR_COMPILER_CACHE_HIT: String(cacheHit) },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (await child.exited !== 0) throw new Error(`Vercel build failed: ${args.join(' ')}`)
}

const hit = await ensureCompiler(root, async () => {
  console.log('Browser compiler cache miss; building from Rust sources')
  await run(['pnpm', 'run', 'setup:compiler'], false)
  await run(['pnpm', 'run', 'build:worker'], false)
})
console.log(hit ? 'Browser compiler cache hit; skipping Rust setup and compilation' : 'Saved browser compiler cache')
// Always rebuild the worker, library, and website from the current TypeScript.
await run(['pnpm', 'run', 'build:website'], true)

await writeVercelOutput(join(root, 'site/dist'), join(root, '.vercel/output'))
