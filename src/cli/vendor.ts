import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { init, parse } from 'es-module-lexer'
import { withBase } from '../project'

type Replacement = {
  start: number
  end: number
  target: string
  quoted: boolean
}

type VendorResource = {
  url: string
  contents: Buffer
  contentType: string
  replacements: Replacement[]
  parsePromise: Promise<void> | undefined
}

export type VendorModulesOptions = {
  moduleUrls: string[]
  load: (url: string) => Promise<Response>
  resolveModule: (specifier: string) => string
}

export type VendoredModules = {
  moduleUrl: (sourceUrl: string, base: string) => string
  write: (destination: string, base: string) => Promise<void>
}

function normalizedUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  return url.href
}

function remoteUrl(specifier: string, parentUrl: string, resolveModule: (specifier: string) => string) {
  if (/^https?:\/\//.test(specifier)) return normalizedUrl(specifier)
  if (specifier.startsWith('//')
    || specifier.startsWith('/')
    || specifier.startsWith('./')
    || specifier.startsWith('../')) {
    return normalizedUrl(new URL(specifier, parentUrl).href)
  }
  return normalizedUrl(resolveModule(specifier))
}

function keepsOriginalUrl(specifier: string) {
  return specifier.startsWith('#')
    || (/^[a-z][a-z\d+.-]*:/i.test(specifier) && !/^https?:\/\//.test(specifier))
}

function contentExtension(resource: VendorResource) {
  const type = resource.contentType.split(';', 1)[0].trim().toLowerCase()
  const knownTypes: Record<string, string> = {
    'application/javascript': '.js',
    'application/json': '.json',
    'application/pdf': '.pdf',
    'application/wasm': '.wasm',
    'application/x-javascript': '.js',
    'application/ecmascript': '.js',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'font/otf': '.otf',
    'font/ttf': '.ttf',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'text/css': '.css',
    'text/ecmascript': '.js',
    'text/javascript': '.js',
    'video/mp4': '.mp4',
    'video/ogg': '.ogg',
    'video/webm': '.webm',
  }
  if (knownTypes[type]) return knownTypes[type]
  const extension = extname(new URL(resource.url).pathname).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin'
}

function isJavaScript(resource: VendorResource) {
  const type = resource.contentType.split(';', 1)[0].trim().toLowerCase()
  if (['application/ecmascript', 'application/javascript', 'application/x-javascript', 'text/ecmascript', 'text/javascript'].includes(type)) return true
  return ['.js', '.mjs'].includes(extname(new URL(resource.url).pathname).toLowerCase())
}

function isCss(resource: VendorResource) {
  const type = resource.contentType.split(';', 1)[0].trim().toLowerCase()
  return type === 'text/css' || extname(new URL(resource.url).pathname).toLowerCase() === '.css'
}

function resourceName(resource: VendorResource) {
  const hash = createHash('sha256').update(resource.url).digest('hex').slice(0, 12)
  return `${hash}${contentExtension(resource)}`
}

function stringReplacement(
  match: RegExpMatchArray,
  specifier: string,
  target: string,
) {
  const matchStart = match.index!
  const specifierStart = match[0].lastIndexOf(specifier)
  return {
    start: matchStart + specifierStart,
    end: matchStart + specifierStart + specifier.length,
    target,
    quoted: false,
  }
}

function graphHash(resources: Map<string, VendorResource>) {
  const hash = createHash('sha256')
  for (const resource of [...resources.values()].sort((a, b) => a.url.localeCompare(b.url))) {
    hash.update(resource.url)
    hash.update('\0')
    hash.update(resource.contentType)
    hash.update('\0')
    hash.update(resource.contents)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 12)
}

function stripSourceMapReferences(source: string) {
  return source
    .replace(/^\s*\/\/[#@]\s*sourceMappingURL=.*$/gm, '')
    .replace(/\/\*[#@]\s*sourceMappingURL=.*?\*\//gs, '')
}

export async function vendorModules(options: VendorModulesOptions): Promise<VendoredModules> {
  const resources = new Map<string, VendorResource>()
  const aliases = new Map<string, string>()
  const fetches = new Map<string, Promise<VendorResource>>()

  async function fetchResource(requestedUrl: string) {
    const requested = normalizedUrl(requestedUrl)
    const aliased = aliases.get(requested)
    if (aliased && resources.has(aliased)) return resources.get(aliased)!
    const existing = resources.get(requested)
    if (existing) return existing
    const pending = fetches.get(requested)
    if (pending) return pending

    const fetching = (async () => {
      const response = await options.load(requested)
      if (!response.ok) {
        throw new Error(`Unable to vendor ${requested}: ${response.status} ${response.statusText}`)
      }
      const finalUrl = normalizedUrl(response.url || requested)
      aliases.set(requested, finalUrl)
      const finalResource = resources.get(finalUrl)
      if (finalResource) return finalResource
      const resource: VendorResource = {
        url: finalUrl,
        contents: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || '',
        replacements: [],
        parsePromise: undefined,
      }
      resources.set(finalUrl, resource)
      return resource
    })()
    fetches.set(requested, fetching)
    try {
      return await fetching
    } finally {
      fetches.delete(requested)
    }
  }

  async function parseResource(resource: VendorResource, ancestors: Set<string>): Promise<void> {
    if (ancestors.has(resource.url)) return
    if (resource.parsePromise) return resource.parsePromise
    const nextAncestors = new Set(ancestors).add(resource.url)
    resource.parsePromise = (async () => {
      const source = resource.contents.toString('utf8')
      const references: Array<{ target: string, replacement: Replacement }> = []

      if (isJavaScript(resource)) {
        await init
        const [imports] = parse(source)
        for (const imported of imports) {
          // Minification can turn import('url') into import(`url`). The lexer
          // does not provide a name for template literals, even constant ones.
          const expression = imported.d >= 0 ? source.slice(imported.s, imported.e) : ''
          const specifier = imported.n ?? (
            /^`[^`\\]*`$/.test(expression) && !expression.includes('${')
              ? expression.slice(1, -1)
              : undefined
          )
          if (!specifier || keepsOriginalUrl(specifier)) continue
          const target = remoteUrl(specifier, resource.url, options.resolveModule)
          references.push({
            target,
            replacement: {
              start: imported.s,
              end: imported.e,
              target,
              quoted: imported.d >= 0,
            },
          })
        }
        for (const match of source.matchAll(/new\s+URL\s*\(\s*(["'])([^"']+)\1\s*,\s*import\.meta\.url\s*\)/g)) {
          const specifier = match[2]
          if (keepsOriginalUrl(specifier)) continue
          const target = remoteUrl(specifier, resource.url, options.resolveModule)
          references.push({ target, replacement: stringReplacement(match, specifier, target) })
        }
      } else if (isCss(resource)) {
        for (const match of source.matchAll(/@import\s+(["'])([^"']+)\1/g)) {
          const specifier = match[2]
          if (keepsOriginalUrl(specifier)) continue
          const target = remoteUrl(specifier, resource.url, options.resolveModule)
          references.push({ target, replacement: stringReplacement(match, specifier, target) })
        }
        for (const match of source.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)'"\s][^)]*))\s*\)/g)) {
          const specifier = (match[2] || match[3] || '').trim()
          if (!specifier || keepsOriginalUrl(specifier)) continue
          const target = remoteUrl(specifier, resource.url, options.resolveModule)
          references.push({ target, replacement: stringReplacement(match, specifier, target) })
        }
      }

      resource.replacements.push(...references.map(reference => reference.replacement))
      const dependencies = await Promise.all(references.map(({ target }) => fetchResource(target)))
      for (const dependency of dependencies) {
        await parseResource(dependency, nextAncestors)
      }
    })()
    return resource.parsePromise
  }

  for (const url of options.moduleUrls) {
    const resource = await fetchResource(url)
    await parseResource(resource, new Set())
  }

  const revision = graphHash(resources)
  function localUrl(sourceUrl: string, base: string) {
    const requested = normalizedUrl(sourceUrl)
    const canonical = aliases.get(requested) || requested
    const resource = resources.get(canonical)
    if (!resource) throw new Error(`Module was not vendored: ${sourceUrl}`)
    return withBase(base, `/_jar/vendor/${revision}/${resourceName(resource)}`)
  }

  return {
    moduleUrl: localUrl,
    async write(destination, base) {
      const outputRoot = join(destination, revision)
      await mkdir(outputRoot, { recursive: true })
      for (const resource of resources.values()) {
        let contents = resource.contents
        if (resource.replacements.length || isJavaScript(resource) || isCss(resource)) {
          let source = contents.toString('utf8')
          for (const replacement of [...resource.replacements].sort((a, b) => b.start - a.start)) {
            const value = localUrl(replacement.target, base)
            source = source.slice(0, replacement.start)
              + (replacement.quoted ? JSON.stringify(value) : value)
              + source.slice(replacement.end)
          }
          contents = Buffer.from(stripSourceMapReferences(source))
        }
        await writeFile(join(outputRoot, resourceName(resource)), contents)
      }
    },
  }
}
