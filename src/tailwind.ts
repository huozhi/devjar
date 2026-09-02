const tailwindBrowserCdn = 'https://unpkg.com/@tailwindcss/browser@'

export function getTailwindBrowserUrl(dependencies: Record<string, string>) {
  const version = dependencies['@tailwindcss/browser'] || dependencies.tailwindcss
  return version
    ? tailwindBrowserCdn + encodeURIComponent(version)
    : undefined
}
