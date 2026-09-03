import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'

const input = JSON.parse(await readFile(process.argv[2], 'utf8'))
register(new URL('./http-loader.mjs', import.meta.url), {
  data: { imports: input.imports },
})
const reactModule = await import(input.react)
const serverModule = await import(input.reactDomServer)
const React = reactModule.default || reactModule
const rendered = {}
const startBoundary = '<template data-devjar-prerender="start"></template>'
const endBoundary = '<template data-devjar-prerender="end"></template>'

function contentBetween(document, start, end) {
  const startIndex = document.indexOf(start)
  const endIndex = document.indexOf(end, startIndex + start.length)
  if (startIndex < 0 || endIndex < 0) {
    throw new Error('Devjar could not read the prerendered document')
  }
  return document.slice(startIndex + start.length, endIndex)
}

function renderedRoute(document) {
  return {
    head: contentBetween(document, '<head>', '</head>'),
    markup: contentBetween(document, startBoundary, endBoundary),
  }
}

for (const [route, entry] of Object.entries(input.routes)) {
  try {
    const pageModule = await import(entry)
    if (typeof pageModule.default !== 'function'
      && (typeof pageModule.default !== 'object' || pageModule.default === null)) {
      throw new Error('page must have a default React component export')
    }
    const document = serverModule.renderToString(
      React.createElement(
        'html',
        null,
        React.createElement('head'),
        React.createElement(
          'body',
          null,
          React.createElement('template', { 'data-devjar-prerender': 'start' }),
          React.createElement(pageModule.default),
          React.createElement('template', { 'data-devjar-prerender': 'end' }),
        ),
      ),
    )
    rendered[route] = renderedRoute(document)
  } catch (error) {
    throw new Error(`Unable to prerender ${route}: ${error?.stack || error}`)
  }
}

await writeFile(input.outputPath, JSON.stringify(rendered))
process.exit(0)
