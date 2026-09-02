import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { Scanner, type ChangedContent } from '@tailwindcss/oxide'
import { compile } from 'tailwindcss'

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
const ignoredDirectories = new Set([
  '.git',
  '.next',
  'build',
  'dist',
  'node_modules',
  'out',
])
const tailwindCssPath = createRequire(import.meta.url).resolve('tailwindcss/index.css')

export type TailwindStylesheet = {
  getCss(): string
  update(paths: string[]): Promise<void>
}

export function usesTailwind(dependencies: Record<string, string>) {
  return 'tailwindcss' in dependencies || '@tailwindcss/browser' in dependencies
}

async function sourcePaths(root: string, excludedPath: string | undefined) {
  const paths: string[] = []

  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name) || path === excludedPath) continue
        await visit(path)
      } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
        paths.push(path)
      }
    }
  }

  await visit(root)
  return paths
}

async function changedContent(path: string): Promise<ChangedContent | undefined> {
  const extension = extname(path)
  if (!sourceExtensions.has(extension)) return

  let content = ''
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  return {
    content,
    extension: extension.slice(1),
  }
}

export async function createTailwindStylesheet(
  root: string,
  excludedPath: string | undefined,
): Promise<TailwindStylesheet> {
  root = resolve(root)
  const tailwindInput = await readFile(tailwindCssPath, 'utf8')
  const compiler = await compile(tailwindInput, {
    base: dirname(tailwindCssPath),
  })
  const scanner = new Scanner({ sources: [] })
  const initialContent = await Promise.all(
    (await sourcePaths(root, excludedPath)).map(changedContent),
  )
  let css = ''

  const build = (content: ChangedContent[]) => {
    const candidates = scanner.scanFiles(content)
    css = compiler.build(candidates)
  }

  build(initialContent.filter(value => value !== undefined))

  return {
    getCss: () => css,
    async update(paths: string[]) {
      const content = (await Promise.all(paths.map(changedContent)))
        .filter(value => value !== undefined)
      if (content.length) build(content)
    },
  }
}
