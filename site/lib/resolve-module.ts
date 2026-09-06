const CDN_HOST = 'https://esm.sh'
const REACT_DEV_MODULES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
])

export function resolveModule(specifier: string) {
  if (specifier === '@react-three/fiber') return `${CDN_HOST}/@react-three/fiber@9.3.0?deps=react@19.2.8,react-dom@19.2.8,three@0.180.0&dev&bundle`
  if (specifier === 'three') return `${CDN_HOST}/three@0.180.0?dev`
  if (specifier === 'swr' || specifier.startsWith('swr/')) {
    return `${CDN_HOST}/${specifier.replace(/^swr/, 'swr@2.5.1')}?deps=react@19.2.8&dev`
  }
  const pinned = specifier.replace(/^(react|react-dom)(?=\/|$)/, '$1@19.2.8')
  const url = `${CDN_HOST}/${pinned}`
  return REACT_DEV_MODULES.has(specifier) ? `${url}?dev` : url
}

