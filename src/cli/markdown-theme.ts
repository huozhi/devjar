import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const markdownThemes = ['studio', 'primer', 'editorial', 'academic'] as const
export type MarkdownTheme = typeof markdownThemes[number]

export function markdownTheme(value: string | undefined): MarkdownTheme {
  if (value === undefined) return 'studio'
  if (!(markdownThemes as readonly string[]).includes(value)) {
    throw new Error(`Unknown Markdown theme: ${value}. Choose studio, primer, editorial, or academic.`)
  }
  return value as MarkdownTheme
}

export function markdownStylesRoot() {
  return fileURLToPath(new URL('./markdown-styles/', import.meta.url))
}

export async function copyMarkdownStyles(destination: string, theme: MarkdownTheme) {
  await mkdir(destination, { recursive: true })
  await Promise.all(['base.css', `${theme}.css`, 'print.css'].map(filename => (
    cp(join(markdownStylesRoot(), filename), join(destination, filename))
  )))
}
