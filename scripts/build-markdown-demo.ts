import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { buildProject } from '../src/cli/index'
import { markdownThemes } from '../src/cli/markdown-theme'

const root = join(import.meta.dir, '..')
const previews = join(root, 'site/public/markdown-previews')
await rm(previews, { recursive: true, force: true })
await mkdir(previews, { recursive: true })

for (const theme of markdownThemes) {
  const result = await buildProject({
    root: join(root, 'examples/markdown'), outDir: `dist/themes/${theme}`,
    cdn: undefined, prerender: true, exclude: [], base: `/markdown-previews/${theme}/`, theme,
  })
  await cp(result.outDir, join(previews, theme), { recursive: true })
}
console.log('Markdown theme previews ready')
