import { homedir } from 'node:os'
import { realpath, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, sep } from 'node:path'
import { sourceExtensions } from '../shared/project'

export const pageFileExtensions = [...sourceExtensions, '.md']

export type PageEntry = {
  /** Project root: the nearest folder with package.json, or the file's folder. */
  root: string
  /** The page file relative to root, served at `/`. */
  entry: string
}

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Resolves `devjar dev chart.tsx` or `devjar dev notes.md` to one page served
 * at `/`. Returns undefined for anything other than a React or Markdown file.
 */
export async function pageEntry(path: string): Promise<PageEntry | undefined> {
  if (!pageFileExtensions.includes(extname(path)) || !await isFile(path)) return
  const file = await realpath(path)
  // A file inside a project keeps its project's imports and package versions.
  // Stop at the home folder, where a stray package.json would make all of it the root.
  const home = homedir()
  for (let directory = dirname(file); directory !== home; directory = dirname(directory)) {
    if (await isFile(join(directory, 'package.json'))) {
      return { root: directory, entry: relative(directory, file).split(sep).join('/') }
    }
    if (dirname(directory) === directory) break
  }
  return { root: dirname(file), entry: relative(dirname(file), file) }
}
