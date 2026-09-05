import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { isNewerVersion } from '../src/cli/update.ts'
import { releaseVersion } from './release-version.ts'

const output = process.env.GITHUB_OUTPUT
if (!output) throw new Error('GITHUB_OUTPUT is required')

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const version = releaseVersion(packageJson.version, process.env.RELEASE_BUMP, process.env.RELEASE_CHANNEL)
if (!isNewerVersion(version, packageJson.version)) {
  throw new Error(`Release version must be valid semver newer than ${packageJson.version}: ${version}`)
}
const tag = `v${version}`
const tags = execFileSync('git', ['tag', '--list', tag], { encoding: 'utf8' }).trim()
if (tags) throw new Error(`Release tag already exists: ${tag}`)
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
  throw new Error('Release preparation requires a clean working tree')
}

// This pnpm lockfile has no root package version to update.
packageJson.version = version
writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n')
appendFileSync(output, `tag=${tag}\n`)
console.log(`Release: ${packageJson.name}@${version}`)
