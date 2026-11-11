import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { init, parse } from 'es-module-lexer/minimal'
import { transformSync } from 'oxc-transform'
import { collectProjectFiles, compileProjectModule, moduleAssetName } from './modules'
import { runNode } from './node-runner'
import type { RouteCall, RouteInput } from './runners/route-runner'
import { getTransformErrorMessage, getTransformOptions } from './transform'

/** Export names of a page, read without running it. */
export async function pageExports(page: string) {
  const transformed = transformSync(page, await readFile(page, 'utf8'), getTransformOptions(page, false, false))
  const error = getTransformErrorMessage(transformed.errors)
  if (error) throw new Error(error)
  await init()
  return new Set(parse(transformed.code)[1].map(entry => entry.n))
}

export type RouteEvaluation = Omit<RouteCall, 'url'>

/**
 * Compiles the pages that export paths() or defaultParams, with everything they
 * import, into a fresh directory, so an edit never reuses stale data.
 */
export async function createRouteEvaluator(root: string, pages: string[], resolveModule: (specifier: string) => string) {
  const directory = await mkdtemp(join(tmpdir(), 'devjar-routes-'))
  const moduleUrl = (projectPath: string) => pathToFileURL(join(directory, moduleAssetName(projectPath) + '.mjs')).href
  try {
    let runtimeModuleUrl = new URL('./index.js', import.meta.url)
    try { await access(runtimeModuleUrl) } catch { runtimeModuleUrl = new URL('../../dist/index.js', import.meta.url) }
    const files = new Set<string>()
    for (const page of pages) {
      for (const file of await collectProjectFiles(root, page)) files.add(file)
    }
    for (const projectPath of files) {
      const compiled = await compileProjectModule({
        root, projectPath, resolveModule, moduleUrl,
        assetUrl: path => '/' + path,
        runtimeModuleUrl: runtimeModuleUrl.href,
        development: false, refresh: false, platform: 'server', stylesheets: 'adopted',
      })
      await writeFile(join(directory, moduleAssetName(projectPath) + '.mjs'), compiled.code)
    }
    return {
      /** Project files whose contents can change the evaluated routes. */
      inputs: new Set([...files].map(file => file.replace(/\?.*$/, ''))),
      async evaluate(evaluations: RouteEvaluation[]): Promise<unknown[]> {
        if (!evaluations.length) return []
        const input: RouteInput = {
          imports: {
            react: resolveModule('react'),
            'react/jsx-runtime': resolveModule('react/jsx-runtime'),
            'es-module-lexer/minimal': resolveModule('es-module-lexer/minimal'),
          },
          calls: evaluations.map(evaluation => ({
            ...evaluation,
            url: moduleUrl(relative(root, evaluation.page).split(sep).join('/')),
          })),
        }
        return runNode<unknown[]>('route-runner', input, { directory, forwardOutput: false })
      },
      close: () => rm(directory, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
