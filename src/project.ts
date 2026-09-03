export const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js']

export function normalizeRoute(route: string) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, '')
  return cleanRoute ? `/${cleanRoute}` : '/'
}

export function normalizeBase(base: string) {
  if (/[?#]/.test(base) || base.includes('://') || /[<>"']/.test(base)) {
    throw new Error(`Invalid base path: ${base}`)
  }
  const segments = base.replace(/\\/g, '/').split('/').filter(Boolean)
  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Invalid base path: ${base}`)
  }
  return segments.length ? `/${segments.join('/')}/` : '/'
}

export function withBase(base: string, path: string) {
  if (path === '/') return base
  return base === '/' ? path : `${base.slice(0, -1)}${path}`
}

export function withoutBase(base: string, pathname: string) {
  if (base === '/') return pathname
  if (pathname === base.slice(0, -1)) return '/'
  if (!pathname.startsWith(base)) return
  return `/${pathname.slice(base.length)}`
}

export function routeFromPagePath(pagePath: string) {
  const extension = sourceExtensions.find(extension => pagePath.endsWith(extension))
  if (!extension) return
  const pathWithoutExtension = pagePath.slice(0, -extension.length)
  return normalizeRoute(pathWithoutExtension.replace(/(?:^|\/)index$/, ''))
}
