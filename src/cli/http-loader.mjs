let imports = {}

export function initialize(data) {
  imports = data.imports
}

export async function resolve(specifier, context, nextResolve) {
  if (imports[specifier]) {
    return { url: imports[specifier], shortCircuit: true }
  }
  if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
    return { url: specifier, shortCircuit: true }
  }
  if ((context.parentURL?.startsWith('http://') || context.parentURL?.startsWith('https://'))
    && (specifier.startsWith('/') || specifier.startsWith('.'))) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`)
    return { format: 'module', source: await response.text(), shortCircuit: true }
  }
  return nextLoad(url, context)
}
