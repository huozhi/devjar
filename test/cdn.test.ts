import { expect, test } from 'bun:test'
import { CDN_HOST, createEsmShResolver, createPreviewResolver } from '../src/cdn'

test('iframe dependencies resolve React without relying on a host import map', () => {
  const resolve = createPreviewResolver({ react: '19.2.8', 'react-dom': '19.2.8', swr: '2.3.0' })
  expect(resolve('react')).toBe('https://esm.sh/react@19.2.8?dev')
  for (const name of ['react-dom/client', 'react-refresh', 'swr', 'swr/infinite', 'swr/subscription']) {
    const url = new URL(resolve(name))
    expect(url.searchParams.has('external')).toBe(false)
    expect(url.searchParams.has('dev')).toBe(true)
    expect(url.searchParams.get('deps')).toBe('react@19.2.8')
  }
  expect(new URL(createPreviewResolver({ react: '19.2.3' })('react-dom/client')).pathname).toBe('/react-dom@19.2.3/client')
  expect(new URL(createPreviewResolver({ 'react-dom': '19.2.3' })('react')).pathname).toBe('/react@19.2.3')
  expect(new URL(createPreviewResolver({})('react-dom/client')).searchParams.get('deps')).toBe('react@19.2.0')
})

test('CLI resolver pins versions and externalizes React for the import map', () => {
  const resolveModule = createEsmShResolver(
    { react: '19.1.0', '@scope/pkg': '^2.0.0' },
    CDN_HOST,
    true,
  )
  expect(resolveModule('react/jsx-runtime')).toBe('https://esm.sh/react@19.1.0/jsx-runtime?dev')
  expect(resolveModule('react-dom/client')).toBe('https://esm.sh/react-dom@19.2.0/client?dev&external=react')
  expect(resolveModule('@scope/pkg/subpath')).toBe('https://esm.sh/@scope/pkg@%5E2.0.0/subpath?external=react')
})
