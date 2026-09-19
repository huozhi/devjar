import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/** The project manifest wins; the nearest parent manifest supplies missing packages. */
export function readProjectDependencies(root: string) {
  let parent = dirname(root)
  while (parent !== dirname(parent) && !existsSync(join(parent, 'package.json'))) {
    parent = dirname(parent)
  }
  const roots = parent !== dirname(parent) && existsSync(join(parent, 'package.json'))
    ? [parent, root]
    : [root]
  const versions: Record<string, string> = {}
  const owners: Record<string, string> = {}
  for (const packageRoot of roots) {
    const path = join(packageRoot, 'package.json')
    if (!existsSync(path)) continue
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as PackageJson
    for (const [name, version] of Object.entries({ ...manifest.devDependencies, ...manifest.dependencies })) {
      versions[name] = version
      owners[name] = packageRoot
    }
  }
  return { versions, owners }
}
