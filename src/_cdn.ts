export const CDN_HOST = 'https://esm.sh'

const defaultVersions: Record<string, string> = {
  react: '19.2.0',
  'react-dom': '19.2.0',
  'react-refresh': '0.17.0',
}

function packageName(specifier: string) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

export function normalizeCdnHost(cdn = CDN_HOST) {
  const url = new URL(cdn)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Module CDN must use http or https: ${cdn}`)
  }
  return url.href.replace(/\/$/, '')
}

export function createEsmShResolver(
  dependencies: Record<string, string> = {},
  cdn = CDN_HOST,
) {
  const host = normalizeCdnHost(cdn)
  return (specifier: string) => {
    const name = packageName(specifier)
    const version = dependencies[name] || defaultVersions[name]
    if (!version) return `${host}/${specifier}`
    if (/^(?:file:|link:|workspace:|git|https?:)/.test(version)) {
      throw new Error(`CDN dependencies cannot use ${name}@${version}`)
    }
    const subpath = specifier.slice(name.length)
    const dev = name === 'react' || name === 'react-dom' || name === 'react-refresh'
    return `${host}/${name}@${encodeURIComponent(version)}${subpath}${dev ? '?dev' : ''}`
  }
}
