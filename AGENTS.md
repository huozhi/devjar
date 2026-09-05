# Repository guidance

## Commits

- Use Conventional Commits for commit messages.

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
