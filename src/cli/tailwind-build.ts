import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sourceExtensions } from '../project'

type CompileTailwindOptions = {
  root: string
  projectPaths: Set<string>
  renderedMarkup: string[]
  compilerUrl: string
  stylesheetUrl: string
}

type TailwindInput = {
  candidates: string[]
  compilerUrl: string
  stylesheetUrl: string
  outputPath: string
}

const runFile = promisify(execFile)
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

function nodeExecutable() {
  const versions = process.versions as NodeJS.ProcessVersions & { bun?: string }
  return versions.bun ? 'node' : process.execPath
}

function renderError(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const stderr = (error as Error & { stderr?: string }).stderr?.trim()
  return stderr || error.message
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
    const outputPath = join(temporaryRoot, 'tailwind.css')
    const input: TailwindInput = {
      candidates: [...candidates].sort(),
      compilerUrl: options.compilerUrl,
      stylesheetUrl: options.stylesheetUrl,
      outputPath,
    }
    const inputPath = join(temporaryRoot, 'input.json')
    await writeFile(inputPath, JSON.stringify(input))
    const runnerPath = fileURLToPath(new URL('./tailwind-runner.mjs', import.meta.url))
    try {
      await runFile(nodeExecutable(), ['--no-warnings', runnerPath, inputPath], {
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch (error) {
      throw new Error(`Unable to compile Tailwind CSS: ${renderError(error)}`)
    }
    return Buffer.from(await readFile(outputPath))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}
