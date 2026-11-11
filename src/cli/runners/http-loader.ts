import type { InitializeHook, LoadHook, ResolveHook } from 'node:module'

// Lets runners import CDN modules over HTTP and map bare specifiers to them.
let imports: Record<string, string> = {}

const isHttp = (url: string | undefined) => Boolean(url?.startsWith('http://') || url?.startsWith('https://'))

export const initialize: InitializeHook<{ imports: Record<string, string> }> = data => {
  imports = data.imports
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (imports[specifier]) return { url: imports[specifier], shortCircuit: true }
  if (isHttp(specifier)) return { url: specifier, shortCircuit: true }
  if (isHttp(context.parentURL) && (specifier.startsWith('/') || specifier.startsWith('.'))) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export const load: LoadHook = async (url, context, nextLoad) => {
  if (!isHttp(url)) return nextLoad(url, context)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`)
  return { format: 'module', source: await response.text(), shortCircuit: true }
}
