export const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js']

export function normalizeRoute(route: string) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, '')
  return cleanRoute ? `/${cleanRoute}` : '/'
}

export function routeFromPagePath(pagePath: string) {
  const extension = sourceExtensions.find(extension => pagePath.endsWith(extension))
  if (!extension) return
  const pathWithoutExtension = pagePath.slice(0, -extension.length)
  return normalizeRoute(pathWithoutExtension.replace(/(?:^|\/)index$/, ''))
}
