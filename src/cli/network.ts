import type { NetworkInterfaceInfo } from 'node:os'

export function networkUrls(host: string, port: number, base: string, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>) {
  if (host !== '0.0.0.0' && host !== '::') return []
  const addresses = Object.values(interfaces).flatMap(entries => entries || [])
    .filter(entry => !entry.internal && (
      entry.family === 'IPv4'
      || (host === '::' && entry.family === 'IPv6' && entry.scopeid === 0)
    ))
    .map(entry => entry.family === 'IPv6' ? `[${entry.address}]` : entry.address)
  return [...new Set(addresses)].map(address => `http://${address}:${port}${base}`)
}
