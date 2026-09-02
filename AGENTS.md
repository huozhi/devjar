# Repository guidance

## TypeScript and API design

- Avoid optional parameters and default arguments when callers can pass values explicitly.
- Prefer required fields in options objects, using an explicit union such as `string | undefined` only when absence is meaningful.
- Keep optional parameters when they are necessary for compatibility or accurately model the API.
