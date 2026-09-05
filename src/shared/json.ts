export function createJsonModule(source: string) {
  return `export default JSON.parse(${JSON.stringify(source)})\n`
}
