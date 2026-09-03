import { createEsmShResolver } from './cdn'

export function getTailwindBrowserUrl(
  dependencies: Record<string, string>,
  cdn: string,
  development: boolean,
) {
  const version = dependencies['@tailwindcss/browser'] || dependencies.tailwindcss
  if (!version) return
  return createEsmShResolver(
    { '@tailwindcss/browser': version },
    cdn,
    development,
  )('@tailwindcss/browser')
}
