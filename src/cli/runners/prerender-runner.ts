import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import type { RunnerInput } from '../node-runner'

export type PrerenderInput = {
  /** Route to the URL of its compiled page module. */
  routes: Record<string, string>
  react: string
  reactDomServer: string
  imports: Record<string, string>
}

export type RenderedRoute = { head: string; markup: string }

type CreateElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown

const input: PrerenderInput & RunnerInput = JSON.parse(await readFile(process.argv[2], 'utf8'))
register(input.loader, { data: { imports: input.imports } })
const reactModule = await import(input.react)
const { renderToString } = await import(input.reactDomServer) as { renderToString: (element: unknown) => string }
const { createElement: h } = (reactModule.default || reactModule) as { createElement: CreateElement }
const startBoundary = '<template data-devjar-prerender="start"></template>'
const endBoundary = '<template data-devjar-prerender="end"></template>'

function contentBetween(document: string, start: string, end: string) {
  const startIndex = document.indexOf(start)
  const endIndex = document.indexOf(end, startIndex + start.length)
  if (startIndex < 0 || endIndex < 0) throw new Error('Devjar could not read the prerendered document')
  return document.slice(startIndex + start.length, endIndex)
}

const rendered: Record<string, RenderedRoute> = {}
for (const [route, module] of Object.entries(input.routes)) {
  try {
    const page = (await import(module)).default
    if (typeof page !== 'function' && (typeof page !== 'object' || page === null)) {
      throw new Error('page must have a default React component export')
    }
    // React hoists title, meta and link tags into <head>; the boundaries mark the page markup.
    const document = renderToString(h('html', null, h('head', null), h('body', null,
      h('template', { 'data-devjar-prerender': 'start' }),
      h(page, null),
      h('template', { 'data-devjar-prerender': 'end' }),
    )))
    rendered[route] = {
      head: contentBetween(document, '<head>', '</head>'),
      markup: contentBetween(document, startBoundary, endBoundary),
    }
  } catch (error) {
    throw new Error(`Unable to prerender ${route}: ${(error as Error)?.stack || error}`)
  }
}

await writeFile(input.outputPath, JSON.stringify(rendered))
process.exit(0)
