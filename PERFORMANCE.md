# CLI performance roadmap

Work through these changes in order. Measure cold startup, navigation, and edit-to-render time after each item before moving to the next.

## 1. Separate the CLI runtime

Status: complete

- Keep the iframe-based `<DevJar>` runtime for embedded editors and untrusted snippets.
- Render CLI projects directly into the document with a single React root.
- Keep the existing project payload initially so this step isolates the cost and complexity of the extra React host, iframe, and cross-frame navigation bridge.
- Preserve development reloads, production builds, error reporting, public files, API files, and custom CDN resolution.

Done when:

- `devjar dev` and `devjar start` render without an iframe.
- Internal navigation works in the same document.
- The public `<DevJar>` component remains iframe-based and its API is unchanged.

Result:

- The CLI client renders directly into `#__reactRoot`; the browser regression check found zero iframes.
- Route navigation keeps the same host root and no longer needs a cross-frame click bridge.
- The public `<DevJar>` implementation and exports are unchanged.
- Manual dashboard measurements on 2026-09-02: 1,074 ms client start to first render in a fresh browser context, 5.4 ms `/` to `/projects`, and 124 ms file-change to render. These are local reference points, not stable CI thresholds.

## 4. Compile Tailwind on the server

Status: complete

- Remove `@tailwindcss/browser` from the CLI runtime.
- Compile one stylesheet on the server and update it incrementally during development.
- Emit ordinary CSS in production builds.

Done when:

- CLI pages make no request for the Tailwind browser runtime.
- Tailwind class edits update without a full page reload.
- Production output contains compiled CSS.

Result:

- The CLI compiles Tailwind with a persistent server-side compiler and candidate scanner.
- Development serves and refreshes `/__devjar/tailwind.css`; the browser no longer loads `@tailwindcss/browser`.
- Production emits an ordinary `__devjar/tailwind.css` file.
- Controlled dashboard comparison against `main` on 2026-09-02:
  - Three isolated Chromium profiles: median navigation-to-render improved from 446 ms to 334 ms (25%), client-start-to-render improved from 376 ms to 185 ms (51%), and the Tailwind resource improved from 102 ms remote to 2.6 ms local.
  - Five warm-cache Chromium runs: median navigation-to-render improved from 37.3 ms to 32.9 ms (12%).
  - Seven warm server starts: median startup regressed from 1.7 ms to 9.8 ms, an 8.1 ms one-time cost.
  - Adding new Tailwind candidates reached the updated render in 203 ms without a page reload.

## 5. Use module-based routing

Status: next

- Generate a route manifest whose entries load page modules.
- Keep one React root alive across navigation.
- Preload route modules on navigation intent.
- Preserve browser history, back/forward navigation, 404 handling, and normal external links.

Done when:

- Navigating does not fetch or reconstruct the complete project graph.
- Shared modules remain loaded between routes.
- Prefetched routes transition without a network wait.

## 6. Add module-level HMR

Status: queued

- Maintain a server-side module and reverse-import graph.
- Transform and invalidate only changed modules and their affected importers.
- Send precise update messages to the browser and apply React Refresh at an HMR boundary.
- Reload only when an update cannot be accepted safely.

Done when:

- Editing one component does not refetch the complete project.
- Unrelated file edits do not rerender the active route.
- Component state survives accepted updates.
