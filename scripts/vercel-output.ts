import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const immutable = 'public, max-age=31536000, immutable'

export const vercelOutputConfig = {
  version: 3,
  routes: [
    {
      src: '/_jar/assets/(.*)',
      headers: { 'Cache-Control': immutable },
      continue: true,
    },
    {
      src: '/_jar/vendor/(.*)',
      headers: { 'Cache-Control': immutable },
      continue: true,
    },
    {
      src: '/_jar/runtime-(.*)\\.js',
      headers: { 'Cache-Control': immutable },
      continue: true,
    },
  ],
}

export async function writeVercelOutput(staticSource: string, outputRoot: string) {
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })
  await cp(staticSource, join(outputRoot, 'static'), { recursive: true })
  await writeFile(join(outputRoot, 'config.json'), JSON.stringify(vercelOutputConfig, null, 2))
}
