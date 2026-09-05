import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function summarizeChanges(commits, repository) {
  const groups = { Features: [], Fixes: [] }
  const seen = new Set()
  for (const { sha, subject, body, files } of commits) {
    const match = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(subject)
    if (!match || /^(site|website|examples?|docs)$/.test(match[2] || '')) continue
    const breaking = Boolean(match[3] || /^BREAKING[ -]CHANGE:/m.test(body))
    if (!['feat', 'fix', 'perf'].includes(match[1]) && !breaking) continue
    if (!files.some(path => path.startsWith('src/') || ['package.json', 'pnpm-lock.yaml', 'scripts/build-client.ts', 'scripts/build-cli-assets.ts', 'scripts/build-workers.ts'].includes(path))) continue
    const note = /^Release-note: (.+)$/m.exec(body)?.[1] || match[4].replace(/ \(#\d+\)$/, '')
    const text = `${breaking ? '**Breaking:** ' : ''}${note}`
    if (seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    const group = match[1] === 'feat' || breaking ? 'Features' : 'Fixes'
    groups[group].push(`- ${text} ([${sha.slice(0, 7)}](https://github.com/${repository}/commit/${sha}))`)
  }
  return Object.entries(groups).filter(([, items]) => items.length)
    .map(([title, items]) => `## ${title}\n\n${items.join('\n')}`).join('\n\n')
}

export function selectBaseline(releases, target, distance) {
  const stable = !target.split('+')[0].includes('-')
  return releases.filter(release => !release.draft && release.tag_name !== target && (!stable || !release.prerelease))
    .map(release => ({ tag: release.tag_name, distance: distance(release.tag_name) }))
    .filter(release => release.distance !== undefined)
    .sort((a, b) => a.distance - b.distance)[0]?.tag
}

function main() {
  const target = process.argv[2]
  const repository = process.env.GITHUB_REPOSITORY
  if (!target?.startsWith('v') || !repository) throw new Error('A release tag and GITHUB_REPOSITORY are required')
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  git('rev-parse', '--verify', `refs/tags/${target}^{commit}`)
  const releases = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases`, '--paginate', '--slurp'], { encoding: 'utf8' })).flat()
  const previous = selectBaseline(releases, target, tag => {
    if (spawnSync('git', ['merge-base', '--is-ancestor', `refs/tags/${tag}`, `refs/tags/${target}`]).status !== 0) return
    return Number(git('rev-list', '--count', `refs/tags/${tag}..refs/tags/${target}`))
  })
  const range = previous ? `refs/tags/${previous}..refs/tags/${target}` : `refs/tags/${target}`
  const hashes = git('log', '--reverse', '--no-merges', '--format=%H', range).split('\n').filter(Boolean)
  const commits = hashes.map(sha => ({
    sha, subject: git('show', '-s', '--format=%s', sha), body: git('show', '-s', '--format=%b', sha),
    files: git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha).split('\n'),
  }))
  const summary = summarizeChanges(commits, repository) || 'No core feature or fix changes in this release.'
  const changelog = previous ? `https://github.com/${repository}/compare/${previous}...${target}` : `https://github.com/${repository}/commits/${target}`
  process.stdout.write(`${summary}\n\n[Full changelog](${changelog})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
