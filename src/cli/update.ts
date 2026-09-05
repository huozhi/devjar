import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const day = 24 * 60 * 60 * 1000
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/

function parseVersion(version: string) {
  const match = versionPattern.exec(version)
  if (!match) return
  const prerelease = match[4]?.split('.') || []
  if (prerelease.some(part => /^0\d+$/.test(part))) return
  return { core: match.slice(1, 4).map(BigInt), prerelease }
}

export function isNewerVersion(candidate: string, installed: string) {
  const a = parseVersion(candidate)
  const b = parseVersion(installed)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i]
  }
  if (!a.prerelease.length || !b.prerelease.length) return !a.prerelease.length && b.prerelease.length > 0
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i]
    const y = b.prerelease[i]
    if (x === y) continue
    if (x === undefined || y === undefined) return y === undefined
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) return BigInt(x) > BigInt(y)
    if (xn !== yn) return yn
    return x > y
  }
  return false
}

function fetchVersion(url: URL): Promise<string | undefined> {
  return new Promise(resolve => {
    const get = url.protocol === 'https:' ? httpsGet : httpGet
    const request = get(url, { agent: false, headers: { Accept: 'application/json' } }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
        if (body.length > 64 * 1024) request.destroy()
      })
      response.on('error', () => resolve(undefined))
      response.on('end', () => {
        try {
          const version = JSON.parse(body).version
          resolve(response.statusCode === 200 && typeof version === 'string' && parseVersion(version) ? version : undefined)
        } catch { resolve(undefined) }
      })
    })
    // Update checks must never keep a short-lived CLI command running.
    request.on('socket', socket => socket.unref())
    const timeout = setTimeout(() => request.destroy(), 1500)
    timeout.unref()
    request.on('error', () => resolve(undefined))
    request.on('close', () => { clearTimeout(timeout); resolve(undefined) })
  })
}

export async function checkForUpdate(options: {
  version: string
  cacheFile: string
  registry: string
  notify: (message: string) => void
}) {
  try {
    const installed = parseVersion(options.version)
    if (!installed) return
    const channel = installed.prerelease.length ? 'next' : 'latest'
    let cached: { channel: string; checkedAt: number; version: string | undefined } | undefined
    try { cached = JSON.parse(readFileSync(options.cacheFile, 'utf8')) } catch {}
    const age = Date.now() - (cached?.checkedAt ?? 0)
    let version: string | undefined
    if (cached?.channel === channel && age >= 0 && age < day) {
      version = typeof cached.version === 'string' ? cached.version : undefined
    } else {
      version = await fetchVersion(new URL(`devjar/${channel}`, options.registry))
      try {
        await mkdir(dirname(options.cacheFile), { recursive: true })
        await writeFile(options.cacheFile, JSON.stringify({ channel, checkedAt: Date.now(), version }))
      } catch {}
    }
    if (version && isNewerVersion(version, options.version)) {
      options.notify(`\nDevjar update available: ${options.version} → ${version}\nRun npx devjar@${channel} to use it.\n\n`)
    }
  } catch {
    // Offline, malformed responses, and unwritable caches must not affect the CLI.
  }
}

export function createUpdateHint(options: {
  version: string
  cacheFile: string
  registry: string
}) {
  let hint: string | undefined
  let consumed = false
  void checkForUpdate({ ...options, notify: message => { hint = message } })
  return () => {
    if (consumed) return
    consumed = true
    return hint
  }
}
