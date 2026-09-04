import { expect, test } from 'bun:test'
import type { NetworkInterfaceInfo } from 'node:os'
import { networkUrls } from '../src/cli/network'

const address = (ip: string, internal: boolean): NetworkInterfaceInfo => ({
  address: ip, internal, family: 'IPv4', netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${ip}/24`,
})
const interfaces = { lo: [address('127.0.0.1', true)], en0: [address('192.168.1.20', false)], duplicate: [address('192.168.1.20', false)], missing: undefined }

test('network URLs exclude loopback and duplicates and preserve port and base', () => {
  expect(networkUrls('0.0.0.0', 4321, '/preview/', interfaces)).toEqual(['http://192.168.1.20:4321/preview/'])
})
test('localhost binding does not advertise inaccessible network URLs', () => {
  expect(networkUrls('localhost', 3000, '/', interfaces)).toEqual([])
  expect(networkUrls('127.0.0.1', 3000, '/', interfaces)).toEqual([])
})
test('IPv6 wildcard includes globally scoped IPv6 but not link-local addresses', () => {
  const entries: NetworkInterfaceInfo[] = [
    { ...address('fd00::1', false), family: 'IPv6', scopeid: 0 },
    { ...address('fe80::1', false), family: 'IPv6', scopeid: 4 },
  ]
  expect(networkUrls('::', 3000, '/', { en0: entries })).toEqual(['http://[fd00::1]:3000/'])
  expect(networkUrls('0.0.0.0', 3000, '/', { en0: entries })).toEqual([])
})
