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

## 4. Preload and cache Tailwind from the CDN

Status: complete

- Keep Tailwind out of Devjar's package dependencies.
- Resolve the browser runtime version from the project's Tailwind dependency and load it from the configured module CDN.
- Preload the CDN resource and let standard browser caching reuse it.

Done when:

- Devjar does not install a Tailwind compiler or platform-specific scanner.
- The Tailwind request starts before the application client.
- Tailwind class edits update without a full page reload.
- Development and production use the same cached CDN runtime.

Result:

- Devjar has no Tailwind package dependency; projects select the matching `@tailwindcss/browser` version through their existing Tailwind dependency and configured module CDN.
- The generated HTML preloads the CDN script and executes it before the application client.
- Manual dashboard measurements on 2026-09-03: a cached esm.sh reload transferred 0 bytes; its entry module took 0.8 ms and bundled module took 0 ms.
- Adding new Tailwind candidates reached the updated render in 221 ms without a page reload.

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
