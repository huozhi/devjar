import { expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  const prepare = (version: string) => Bun.spawnSync(['node', script], {
    cwd: root,
    env: { ...process.env, RELEASE_VERSION: version, GITHUB_OUTPUT: output },
    stdout: 'pipe', stderr: 'pipe',
  })
  return { directory, root, output, git, prepare }
}

test('manual release prepares only the version and tag output', async () => {
  for (const version of ['1.0.0-next.1', '1.0.0']) {
    const project = await fixture()
    try {
      const result = project.prepare(version)
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(JSON.parse(await readFile(join(project.root, 'package.json'), 'utf8'))).toEqual({ name: 'devjar', version })
      expect(await readFile(project.output, 'utf8')).toBe(`tag=v${version}\n`)
      expect(project.git(['diff', '--name-only'])).toBe('package.json')
      expect(project.git(['tag', '--list'])).toBe('')
    } finally { await rm(project.directory, { recursive: true, force: true }) }
  }
})

test('manual release rejects invalid, duplicate, older, and dirty releases before editing', async () => {
  const project = await fixture()
  try {
    const original = await readFile(join(project.root, 'package.json'), 'utf8')
    for (const version of ['v1.0.0', '1.0', '1.0.0-next.01', '0.11.0', '0.10.0', '1.0.0\ntag=bad', '$(exit 0)']) {
      expect(project.prepare(version).exitCode).not.toBe(0)
      expect(await readFile(join(project.root, 'package.json'), 'utf8')).toBe(original)
    }
    project.git(['tag', 'v1.0.0-next.1'])
    expect(project.prepare('1.0.0-next.1').stderr.toString()).toContain('Release tag already exists')
    await writeFile(join(project.root, 'unrelated.txt'), 'Keep this change')
    expect(project.prepare('1.0.0').stderr.toString()).toContain('clean working tree')
    expect(await readFile(join(project.root, 'package.json'), 'utf8')).toBe(original)
    expect(await readFile(join(project.root, 'unrelated.txt'), 'utf8')).toBe('Keep this change')
  } finally { await rm(project.directory, { recursive: true, force: true }) }
})
