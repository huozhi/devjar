import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createEsmShResolver } from '../cdn'
import {
  builtAssetUrl,
  collectProjectFiles,
  compileProjectModule,
  moduleAssetName,
} from './modules'

type PrerenderOptions = {
  root: string
  routes: Map<string, string>
  dependencies: Record<string, string>
  devjarDependencies: Record<string, string>
  cdn: string
  base: string
  runtimeModulePath: string
}

export type PrerenderedRoute = {
  head: string
  markup: string
  styles: string
}

type RenderedRoute = Pick<PrerenderedRoute, 'head' | 'markup'>

type RenderInput = {
  routes: Record<string, string>
  react: string
  reactDomServer: string
  imports: Record<string, string>
  outputPath: string
}

const runFile = promisify(execFile)

function serverModuleName(projectPath: string) {
  return `${moduleAssetName(projectPath)}.mjs`
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

export async function prerender(options: PrerenderOptions) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'devjar-prerender-'))
  try {
    const projectFiles = new Set<string>()
    const routeFiles = new Map<string, Set<string>>()
    const projectStyles = new Map<string, string>()
    for (const [route, entry] of options.routes) {
      const files = await collectProjectFiles(options.root, entry)
      routeFiles.set(route, files)
      for (const projectPath of files) projectFiles.add(projectPath)
    }

    for (const projectPath of projectFiles) {
      const compiled = await compileProjectModule({
        root: options.root,
        projectPath,
        dependencies: options.dependencies,
        cdn: options.cdn,
        moduleUrl: importedPath => `./${serverModuleName(importedPath)}`,
        assetUrl: (projectPath, contents) => builtAssetUrl(
          projectPath,
          contents,
          options.base,
        ),
        runtimeModuleUrl: pathToFileURL(options.runtimeModulePath).href,
        development: false,
        refresh: false,
        platform: 'server',
      })
      await writeFile(join(temporaryRoot, serverModuleName(projectPath)), compiled.code)
      if (compiled.style !== undefined) projectStyles.set(projectPath, compiled.style)
    }

    const outputPath = join(temporaryRoot, 'rendered.json')
    const resolveModule = createEsmShResolver(options.dependencies, options.cdn, false)
    const resolveRuntimeModule = createEsmShResolver({
      ...options.dependencies,
      ...options.devjarDependencies,
    }, options.cdn, false)
    const input: RenderInput = {
      routes: Object.fromEntries([...options.routes].map(([route, entry]) => {
        const projectPath = relative(options.root, entry).split(sep).join('/')
        return [route, pathToFileURL(join(temporaryRoot, serverModuleName(projectPath))).href]
      })),
      react: resolveModule('react'),
      reactDomServer: resolveModule('react-dom/server'),
      imports: {
        react: resolveModule('react'),
        'react/jsx-runtime': resolveModule('react/jsx-runtime'),
        'es-module-lexer': resolveRuntimeModule('es-module-lexer'),
      },
      outputPath,
    }
    const inputPath = join(temporaryRoot, 'input.json')
    await writeFile(inputPath, JSON.stringify(input))

    try {
      const rendererPath = fileURLToPath(new URL('./prerender-runner.mjs', import.meta.url))
      await runFile(nodeExecutable(), ['--no-warnings', rendererPath, inputPath], {
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch (error) {
      throw new Error(renderError(error))
    }

    const rendered = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, RenderedRoute>
    const result: Record<string, PrerenderedRoute> = {}
    for (const [route, files] of routeFiles) {
      const styles: string[] = []
      for (const projectPath of files) {
        if (extname(projectPath) === '.css') {
          styles.push(projectStyles.get(projectPath)!)
        }
      }
      result[route] = { ...rendered[route], styles: styles.join('\n') }
    }
    return result
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}
