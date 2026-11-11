import { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

await rm(join(root, 'dist/markdown-styles'), { recursive: true, force: true })

// Runners execute in their own Node process, so each is a standalone ES module.
const runners = await Bun.build({
  entrypoints: ['http-loader', 'route-runner', 'prerender-runner', 'tailwind-runner']
    .map(name => join(root, `src/cli/runners/${name}.ts`)),
  outdir: join(root, 'dist'),
  naming: '[name].mjs',
  target: 'node',
  format: 'esm',
})
if (!runners.success) throw new AggregateError(runners.logs, 'Unable to build CLI runners')

await cp(join(root, 'src/cli/markdown-styles'), join(root, 'dist/markdown-styles'), { recursive: true })
