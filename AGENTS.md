# Repository guidance

## Commits

- Use Conventional Commits for commit messages.
- Use `feat(cli): ...` or `feat(runtime): ...` for core capabilities; use `fix(cli): ...` or `fix(runtime): ...` for user-visible corrections. Use `perf` for measured runtime/build improvements.
- Scope website and demo work as `site` or `examples` (for example, `fix(site): align mobile cards`). Keep it separate from core changes so it stays out of package release notes.
- Use `docs`, `test`, `ci`, `chore`, and `style` for maintenance. Do not label visual polish as a core feature. Release notes include core `feat`, `fix`, and `perf` changes; breaking changes must use `!` or a `BREAKING CHANGE:` footer.
- Write subjects as concise user-facing outcomes. If the subject needs implementation detail, add a one-line `Release-note: ...` footer with the public summary. Do not rewrite published history to retrofit these conventions.

## Pull requests

- When changing a public API, include a short code snippet in the PR description showing how to use the new feature or a before/after code diff showing the change for callers.

## Documentation

- Keep the README focused on what Devjar does, requirements, and the shortest working path for embedded previews and the CLI.
- Use concise, task-oriented prose and small, runnable examples. Describe observable behavior; omit implementation details unless they affect a user's decision or integration.
- Put optional examples and CLI reference material in `<details>` blocks with descriptive summaries. Keep essential setup requirements and constraints visible.
- Keep supporting documentation in `docs/` and detailed runtime contracts in `docs/API.md`, including scheduling, lifecycle, reset behavior, and the lower-level hook. Link to the relevant section from the README instead of duplicating the reference.
- Group repository demos under Examples. Keep contributor setup and release procedures in `AGENTS.md` so agents and human contributors share one reference.
- Extend the existing home for a topic instead of adding another top-level README section for every feature. When moving documentation, update links and remove stale or duplicate guidance.
- For documentation-only changes, check links, Markdown structure, and examples against the current API. Do not add tests for prose changes.

## TypeScript and API design

- Avoid optional parameters and default arguments when callers can pass values explicitly.
- Prefer required fields in options objects, using an explicit union such as `string | undefined` only when absence is meaningful.
- Keep optional parameters when they are necessary for compatibility or accurately model the API.

## CLI product contract

- Keep the Devjar CLI zero-config. Expose user-facing settings as CLI flags rather than adding configuration files or a `devjar` field to `package.json`.
- Read the project's `package.json` only for `dependencies` and `devDependencies`, which provide CDN versions or local package paths. Local dependency manifests may also supply `exports`, `module`, and `main` for entry-point resolution.

## Tests

- Test observable behavior or a concrete failure risk, not implementation structure. Do not add tests for copy edits or mirror an entire config file.
- Give each behavior one primary test location. Extend the existing case or use a table for related inputs before adding another test or file.
- Use the cheapest layer that catches the bug: pure logic in unit tests, file/import/server behavior in source integration tests, package contents in `scripts/check-package.ts`, and real browser loading/navigation in `scripts/test-package-browser.ts`.
- Overlap across layers needs a distinct purpose. A browser smoke test verifies wiring; it should not repeat every unit-test edge case. Keep one representative example export journey rather than testing every demo the same way.
- Assert only the relevant contract. Compare unordered collections as sets or sorted arrays; do not depend on filesystem order, temporary paths, generated hashes, or exact timing.
- Snapshot only small, intentional output contracts such as CLI hints. Avoid snapshots of generated bundles, whole pages, or full configuration objects.
- Keep tests isolated: temporary fixtures, local fake CDNs for source tests, explicit synchronization, bounded waits, and cleanup. Fake renderers do not prove real React/browser compatibility.
- For regressions, fix or extend the owning test. Remove redundant assertions when consolidating, preserving each distinct failure case. Test count and coverage percentage are not goals.
- Run affected tests first, then the normal CI checks once. Repeat only for new changes, failures, or an unresolved risk.

## Local development

```sh
pnpm install
pnpm run build
pnpm run dev
pnpm run typecheck
bun test
```

Source builds cache the generated compiler and install the pinned Rust toolchain
and wasm-bindgen on a cache miss. `setup:compiler` can also run setup explicitly.
Published npm packages include the compiled WASM and do not require Rust.

Run the full build after runtime changes to regenerate client and worker assets.
CLI tests open local HTTP servers.

## Releases

To release, open **Actions → Release → Run workflow** on `main`. Choose
**patch / minor / major** and **next / stable**. From `0.11.0`, major + next
produces `1.0.0-next.1`. During a prerelease cycle, next increments its suffix
and stable promotes the existing target to `1.0.0`; the bump choice is ignored. Actions commits the version as
`github-actions[bot]`, pushes its tag, and starts the **Publish** workflow.
Publish runs the checks, publishes prereleases to `next` (stable versions to
`latest`), and groups core Conventional Commits into Features and Fixes.
Website/example polish and maintenance commits are omitted. Stable notes
compare against the previous published stable release; prereleases compare
against the nearest published ancestor. Follow the Publish run for the
final result. The version commit and tag remain available if publishing fails.

To retry, run **Release** on `main` with **force** enabled. It ignores bump and
channel and uses the current `package.json` version. Publish reuses its tag
without moving it, or creates the tag if missing. It skips unit/browser tests
but still builds, typechecks, and checks the package. An existing npm version
is left untouched; GitHub release notes are created only if the release is missing.
