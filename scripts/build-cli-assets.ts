import { cp } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

await Promise.all([
  cp(join(root, 'src/cli/http-loader.mjs'), join(root, 'dist/http-loader.mjs')),
  cp(join(root, 'src/cli/prerender-runner.mjs'), join(root, 'dist/prerender-runner.mjs')),
])
