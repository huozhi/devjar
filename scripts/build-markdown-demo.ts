import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildProject } from '../src/cli/index'
import { markdownThemes } from '../src/cli/markdown-theme'

const root = join(import.meta.dir, '..')
const previews = join(root, 'site/public/markdown-previews')
await rm(previews, { recursive: true, force: true })
await mkdir(previews, { recursive: true })

for (const theme of markdownThemes) {
  const project = await mkdtemp(join(tmpdir(), 'devjar-reading-fragment-'))
  try {
    await mkdir(join(project, 'pages'))
    await cp(join(root, 'site/lib/markdown-samples', `${theme}.md`), join(project, 'pages/index.md'))
    const result = await buildProject({
      root: project, outDir: 'dist', cdn: undefined, prerender: true, exclude: [],
      base: `/markdown-previews/${theme}/`, theme, math: true,
    })
    await cp(result.outDir, join(previews, theme), { recursive: true })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}
console.log('Markdown reading fragments ready')
