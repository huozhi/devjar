import type { ImportSpecifier } from 'es-module-lexer'

export const textModuleSuffix = '?devjar-text'

export function isTextImport(source: string, imported: ImportSpecifier) {
  if (imported.a < 0) return false
  const attributes = source.slice(imported.a, imported.d < 0 ? imported.se : imported.se - 1)
  const text = String.raw`\{\s*(?:type|"type"|'type')\s*:\s*(?:"text"|'text')\s*,?\s*\}`
  const pattern = imported.d < 0 ? text : String.raw`\{\s*(?:with|"with"|'with')\s*:\s*${text}\s*,?\s*\}`
  return new RegExp(`^${pattern}$`).test(attributes.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '').trim())
}

export function createTextModule(source: string) {
  return `export default ${JSON.stringify(source)}\n`
}
