export function createJsonModule(filename: string, source: string) {
  try {
    JSON.parse(source)
  } catch (error) {
    throw new Error(`Invalid JSON in ${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return `export default JSON.parse(${JSON.stringify(source)})\n`
}
