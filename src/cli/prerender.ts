import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createEsmShResolver } from '../shared/cdn'
import {
  builtAssetUrl,
  collectProjectFiles,
  compileProjectModule,
  moduleAssetName,
} from './modules'
import { runNode } from './node-runner'
import type { PrerenderInput, RenderedRoute } from './runners/prerender-runner'

type PrerenderOptions = {
  root: string
  routes: Map<string, string>
  params: Map<string, Record<string, string>>
  dependencies: Record<string, string>
  devjarDependencies: Record<string, string>
  cdn: string
  base: string
  resolveModule: (specifier: string) => string
  runtimeModulePath: string
}

export type LinkedStylesheet = {
  projectPath: string
  href: string
}

export type PrerenderedRoute = {
  head: string
  markup: string
  /** Hashed CSS files the route imports, in import order. */
  stylesheets: LinkedStylesheet[]
}


function serverModuleName(projectPath: string) {
  return `${moduleAssetName(projectPath)}.mjs`
}

export async function prerender(options: PrerenderOptions) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'devjar-prerender-'))
  try {
    const projectFiles = new Set<string>()
    const routeFiles = new Map<string, Set<string>>()
    const projectStyles = new Map<string, string>()
    const resolveModule = options.resolveModule
    const pageFiles = new Map<string, Set<string>>()
    for (const [route, entry] of options.routes) {
      const files = pageFiles.get(entry) || await collectProjectFiles(options.root, entry)
      pageFiles.set(entry, files)
      routeFiles.set(route, files)
      for (const projectPath of files) projectFiles.add(projectPath)
    }

    for (const projectPath of projectFiles) {
      const compiled = await compileProjectModule({
        root: options.root,
        projectPath,
        resolveModule,
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
        stylesheets: 'adopted',
      })
      await writeFile(join(temporaryRoot, serverModuleName(projectPath)), compiled.code)
      if (compiled.style !== undefined) projectStyles.set(projectPath, compiled.style)
    }

    const resolveRuntimeModule = createEsmShResolver({
      ...options.dependencies,
      ...options.devjarDependencies,
    }, options.cdn, false)
    const input: PrerenderInput = {
      routes: Object.fromEntries([...options.routes].map(([route, entry]) => {
        const projectPath = relative(options.root, entry).split(sep).join('/')
        return [route, { module: pathToFileURL(join(temporaryRoot, serverModuleName(projectPath))).href, params: options.params.get(route) }]
      })),
      react: resolveModule('react'),
      reactDomServer: resolveModule('react-dom/server'),
      imports: {
        react: resolveModule('react'),
        'react/jsx-runtime': resolveModule('react/jsx-runtime'),
        'es-module-lexer/minimal': resolveRuntimeModule('es-module-lexer/minimal'),
      },
    }
    const rendered = await runNode<Record<string, RenderedRoute>>('prerender-runner', input, {
      directory: temporaryRoot, forwardOutput: true,
    })
    const result: Record<string, PrerenderedRoute> = {}
    for (const [route, files] of routeFiles) {
      const stylesheets: LinkedStylesheet[] = []
      for (const projectPath of files) {
        if (extname(projectPath) === '.css') {
          const style = Buffer.from(projectStyles.get(projectPath)!)
          stylesheets.push({ projectPath, href: builtAssetUrl(projectPath, style, options.base) })
        }
      }
      result[route] = { ...rendered[route], stylesheets }
    }
    return result
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}
