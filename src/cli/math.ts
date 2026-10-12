import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export function mathAssetsRoot() {
  return dirname(createRequire(import.meta.url).resolve('katex'))
}

export async function copyMathAssets(destination: string) {
  const root = mathAssetsRoot()
  await mkdir(destination, { recursive: true })
  await Promise.all([
    cp(join(root, '../LICENSE'), join(destination, 'LICENSE')),
    cp(join(root, 'katex.min.css'), join(destination, 'katex.min.css')),
    cp(join(root, 'fonts'), join(destination, 'fonts'), { recursive: true }),
  ])
}
