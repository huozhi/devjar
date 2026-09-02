import { createEsmShResolver } from './_cdn'

export function getTailwindBrowserUrl(
  dependencies: Record<string, string>,
  cdn: string,
) {
  const version = dependencies['@tailwindcss/browser'] || dependencies.tailwindcss
  if (!version) return
  return createEsmShResolver(
    { '@tailwindcss/browser': version },
    cdn,
  )('@tailwindcss/browser')
}
