import { expect, test } from 'bun:test'
import { selectBaseline, summarizeChanges } from '../scripts/release-notes.mjs'

test('release notes include core outcomes and omit polish and maintenance', () => {
  const commit = (subject: string, files: string[], body: string) => ({ sha: 'abc1234567', subject, files, body })
  const result = summarizeChanges([
    commit('feat(runtime): import JSON', ['src/json.ts'], ''),
    commit('fix(cli): improve errors (#42)', ['src/bin/devjar.ts'], ''),
    commit('perf(runtime): reduce compiler work', ['src/core.ts'], ''),
    commit('feat: reshape shader demo', ['site/lib/examples/shader.ts'], ''),
    commit('fix(examples): improve mobile layout', ['examples/personal/styles.css'], ''),
    commit('feat(site): add a banner', ['site/pages/index.tsx', 'package.json'], ''),
    commit('test: fix filesystem order', ['test/local-packages.test.ts'], ''),
    commit('ci: improve publishing', ['.github/workflows/publish.yml'], ''),
    commit('chore: bump version', ['package.json'], ''),
    commit('feat(runtime): import JSON', ['src/json.ts'], ''),
    commit('fix(runtime): change resolver implementation', ['src/cdn.ts'], 'Release-note: Resolve React inside standalone previews.'),
    commit('refactor(runtime)!: remove deprecated API', ['src/index.ts'], ''),
  ], 'huozhi/devjar')
  expect(result).toBe(`## Features

- import JSON ([abc1234](https://github.com/huozhi/devjar/commit/abc1234567))
- **Breaking:** remove deprecated API ([abc1234](https://github.com/huozhi/devjar/commit/abc1234567))

## Fixes

- improve errors ([abc1234](https://github.com/huozhi/devjar/commit/abc1234567))
- reduce compiler work ([abc1234](https://github.com/huozhi/devjar/commit/abc1234567))
- Resolve React inside standalone previews. ([abc1234](https://github.com/huozhi/devjar/commit/abc1234567))`)
  expect(summarizeChanges([commit('docs: update README', ['README.md'], '')], 'huozhi/devjar')).toBe('')
})

test('notes compare reachable published releases and roll up stable releases', () => {
  const releases = [
    { tag_name: 'v1.0.0-next.3', draft: false, prerelease: true },
    { tag_name: 'v1.0.0-next.2', draft: true, prerelease: true },
    { tag_name: 'v1.0.0-next.1', draft: false, prerelease: true },
    { tag_name: 'v2.0.0', draft: false, prerelease: false },
    { tag_name: 'v0.10.0', draft: false, prerelease: false },
  ]
  const distances: Record<string, number> = { 'v1.0.0-next.3': 0, 'v1.0.0-next.2': 1, 'v1.0.0-next.1': 2, 'v0.10.0': 10 }
  expect(selectBaseline(releases, 'v1.0.0-next.3', (tag: string) => distances[tag])).toBe('v1.0.0-next.1')
  expect(selectBaseline(releases, 'v1.0.0', (tag: string) => distances[tag])).toBe('v0.10.0')
  expect(selectBaseline([], 'v1.0.0', () => undefined)).toBeUndefined()
})
