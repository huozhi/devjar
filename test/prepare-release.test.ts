import { expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { releaseVersion } from '../scripts/release-version'

const script = join(import.meta.dir, '../scripts/prepare-release.ts')

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'devjar-release-'))
  const root = join(directory, 'repo')
  await mkdir(root)
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'devjar', version: '0.11.0' }, null, 2) + '\n')
  await writeFile(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  const git = (args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' }).trim()
  git(['init', '--quiet'])
  git(['config', 'user.name', 'Release Test'])
  git(['config', 'user.email', 'test@example.com'])
  git(['add', '.'])
  git(['commit', '--quiet', '-m', 'test: initial package'])
  const output = join(directory, 'output')
  const prepare = (bump: string, channel: string) => Bun.spawnSync(['node', script], {
    cwd: root,
    env: { ...process.env, RELEASE_BUMP: bump, RELEASE_CHANNEL: channel, GITHUB_OUTPUT: output },
    stdout: 'pipe', stderr: 'pipe',
  })
  return { directory, root, output, git, prepare }
}

test('manual release prepares only the version and tag output', async () => {
  for (const [channel, version] of [['next', '1.0.0-next.1'], ['stable', '1.0.0']]) {
    const project = await fixture()
    try {
      const result = project.prepare('major', channel)
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(JSON.parse(await readFile(join(project.root, 'package.json'), 'utf8'))).toEqual({ name: 'devjar', version })
      expect(await readFile(project.output, 'utf8')).toBe(`tag=v${version}\n`)
      expect(project.git(['diff', '--name-only'])).toBe('package.json')
      expect(project.git(['tag', '--list'])).toBe('')
    } finally { await rm(project.directory, { recursive: true, force: true }) }
  }
})

test('manual release rejects invalid, duplicate, and dirty releases before editing', async () => {
  const project = await fixture()
  try {
    const original = await readFile(join(project.root, 'package.json'), 'utf8')
    for (const [bump, channel] of [['release', 'next'], ['major', 'beta'], ['', 'stable'], ['major', ''], ['$(exit 0)', 'next']]) {
      expect(project.prepare(bump, channel).exitCode).not.toBe(0)
      expect(await readFile(join(project.root, 'package.json'), 'utf8')).toBe(original)
    }
    project.git(['tag', 'v1.0.0-next.1'])
    expect(project.prepare('major', 'next').stderr.toString()).toContain('Release tag already exists')
    await writeFile(join(project.root, 'unrelated.txt'), 'Keep this change')
    expect(project.prepare('major', 'stable').stderr.toString()).toContain('clean working tree')
    expect(await readFile(join(project.root, 'package.json'), 'utf8')).toBe(original)
    expect(await readFile(join(project.root, 'unrelated.txt'), 'utf8')).toBe('Keep this change')
  } finally { await rm(project.directory, { recursive: true, force: true }) }
})


test('release choices calculate bumps, preview increments, and stable promotion', () => {
  for (const [current, bump, channel, expected] of [
    ['0.11.0', 'patch', 'stable', '0.11.1'],
    ['0.11.0', 'minor', 'stable', '0.12.0'],
    ['0.11.0', 'major', 'stable', '1.0.0'],
    ['0.11.0', 'patch', 'next', '0.11.1-next.1'],
    ['0.11.0', 'minor', 'next', '0.12.0-next.1'],
    ['0.11.0', 'major', 'next', '1.0.0-next.1'],
    ['1.0.0-next.1', 'major', 'next', '1.0.0-next.2'],
    ['1.0.0-next.9', 'patch', 'next', '1.0.0-next.10'],
    ['1.0.0-next.10', 'major', 'stable', '1.0.0'],
    ['0.12.0-next.1', 'minor', 'stable', '0.12.0'],
    ['0.11.1-next.1', 'patch', 'stable', '0.11.1'],
    ['1.0.0+build.1', 'patch', 'next', '1.0.1-next.1'],
  ]) expect(releaseVersion(current, bump, channel)).toBe(expected)
  for (const invalid of ['1.0', '01.0.0', '1.0.0-next.01', '1.0.0-next.bad', 'unknown']) {
    expect(() => releaseVersion(invalid, 'patch', 'next')).toThrow()
  }
})
