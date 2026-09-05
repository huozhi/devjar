import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { transformSync } from 'oxc-transform'
import { getTransformOptions } from '../src/transform'
import init, { transform } from '../compiler/pkg/devjar_browser_compiler.js'

const wasm = await init({ module_or_path: readFileSync(new URL('../compiler/pkg/devjar_browser_compiler_bg.wasm', import.meta.url)) })

test('browser compiler preserves the native development transform contract', () => {
  expect(wasm.memory.buffer instanceof ArrayBuffer).toBe(true)
  const cases = [
    ['counter.tsx', `import {useState} from 'react'; export default function Counter() { const [n,setN] = useState<number>(0); return <button onClick={() => setN(n+1)}>{n}</button> }`],
    ['enum.ts', 'export enum Color { Red, Blue } export const color: Color = Color.Red'],
    ['text.tsx', `import data from './data.json'; import text from './shader.glsl' with {type:'text'}; export default () => <pre>{data.title}{text}</pre>`],
    ['decorator.ts', 'function sealed(target: Function) {} @sealed export class A { x = 1 }'],
    ['scope.ts', 'export function f(process: {env: {NODE_ENV: string}}) { return process.env.NODE_ENV } export const env = process.env.NODE_ENV'],
  ]
  for (const [filename, source] of cases) {
    const native = transformSync(filename, source, getTransformOptions(filename, true, true))
    expect(native.errors).toEqual([])
    expect(transform(filename, source)).toBe(native.code)
  }
})

test('browser compiler reports syntax errors and can compile after an error', () => {
  expect(() => transform('broken.tsx', 'export default () => <div>')).toThrow('Unexpected token')
  expect(() => transform('duplicate.ts', 'let value = 1; let value = 2')).toThrow()
  expect(transform('valid.ts', 'export const value: number = 1')).toContain('export const value = 1')
})
