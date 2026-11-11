import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { sourceExtensions } from '../shared/project'
import { runNode } from './node-runner'
import type { TailwindInput } from './runners/tailwind-runner'

type CompileTailwindOptions = {
  root: string
  projectPaths: Set<string>
  renderedMarkup: string[]
  compilerUrl: string
  stylesheetUrl: string
}

const quotedValues = [
  /"((?:\\[\s\S]|[^"\\])*)"/g,
  /'((?:\\[\s\S]|[^'\\])*)'/g,
  /`((?:\\[\s\S]|[^`\\])*)`/g,
]

function addCandidates(candidates: Set<string>, value: string) {
  for (const candidate of value.split(/\s+/)) {
    if (candidate && !candidate.includes('${')) candidates.add(candidate)
  }
}

export function extractTailwindCandidates(source: string) {
  // Tailwind validates candidates itself, so collecting quoted source values
  // covers static JSX and conditional class strings without a separate parser.
  const candidates = new Set<string>()
  for (const pattern of quotedValues) {
    for (const match of source.matchAll(pattern)) addCandidates(candidates, match[1])
  }
  return candidates
}

export async function compileTailwind(options: CompileTailwindOptions) {
  const candidates = new Set<string>()
  for (const projectPath of options.projectPaths) {
    if (!sourceExtensions.includes(extname(projectPath))) continue
    const source = await readFile(join(options.root, projectPath), 'utf8')
    for (const candidate of extractTailwindCandidates(source)) candidates.add(candidate)
  }
  for (const markup of options.renderedMarkup) {
    for (const match of markup.matchAll(/\bclass\s*=\s*(["'])(.*?)\1/gs)) {
      addCandidates(candidates, match[2])
    }
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'devjar-tailwind-'))
  try {
    const input: TailwindInput = {
      candidates: [...candidates].sort(),
      compilerUrl: options.compilerUrl,
      stylesheetUrl: options.stylesheetUrl,
    }
    const css = await runNode<string>('tailwind-runner', input, { directory: temporaryRoot, forwardOutput: false })
      .catch(error => { throw new Error(`Unable to compile Tailwind CSS: ${error.message}`) })
    return Buffer.from(css)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}
