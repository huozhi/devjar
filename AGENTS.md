# Repository guidance

## TypeScript and API design

- Avoid optional parameters and default arguments when callers can pass values explicitly.
- Prefer required fields in options objects, using an explicit union such as `string | undefined` only when absence is meaningful.
- Keep optional parameters when they are necessary for compatibility or accurately model the API.

## CLI product contract

- Keep the Devjar CLI zero-config. Expose user-facing settings as CLI flags rather than adding configuration files or a `devjar` field to `package.json`.
- Read `package.json` only for `dependencies` and `devDependencies`, which provide package versions for CDN resolution.
