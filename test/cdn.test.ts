import { expect, test } from 'bun:test'
import { createEsmShResolver, createPreviewResolver } from '../src/cdn'

test('iframe dependencies resolve React without relying on a host import map', () => {
  const resolve = createPreviewResolver({ react: '19.2.8', 'react-dom': '19.2.8', swr: '2.3.0' })
  expect(resolve('react')).toBe('https://esm.sh/react@19.2.8?dev')
  for (const name of ['react-dom/client', 'react-refresh', 'swr']) {
    const url = new URL(resolve(name))
    expect(url.searchParams.has('external')).toBe(false)
    expect(url.searchParams.get('deps')).toBe('react@19.2.8')
  }
  expect(new URL(createPreviewResolver({})('react-dom/client')).searchParams.get('deps')).toBe('react@19.2.0')
})

test('CLI resolution keeps external React for its import map and vendoring', () => {
  const resolve = createEsmShResolver({}, 'https://esm.sh', true)
  expect(new URL(resolve('react-dom/client')).searchParams.get('external')).toBe('react')
})
