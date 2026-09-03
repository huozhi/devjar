import { createEsmShResolver } from './cdn'

function tailwindBrowserVersion(dependencies: Record<string, string>) {
  return dependencies['@tailwindcss/browser'] || dependencies.tailwindcss
}

function tailwindCompilerVersion(dependencies: Record<string, string>) {
  return dependencies.tailwindcss || dependencies['@tailwindcss/browser']
}

export function getTailwindBrowserUrl(
  dependencies: Record<string, string>,
  cdn: string,
  development: boolean,
) {
  const version = tailwindBrowserVersion(dependencies)
  if (!version) return
  return createEsmShResolver(
    { '@tailwindcss/browser': version },
    cdn,
    development,
  )('@tailwindcss/browser')
}

export function getTailwindBuildUrls(
  dependencies: Record<string, string>,
  cdn: string,
) {
  const version = tailwindCompilerVersion(dependencies)
  if (!version) return
  const resolveModule = createEsmShResolver({ tailwindcss: version }, cdn, false)
  return {
    compiler: resolveModule('tailwindcss'),
    stylesheet: resolveModule('tailwindcss/index.css'),
  }
}
