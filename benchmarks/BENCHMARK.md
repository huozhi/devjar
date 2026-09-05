# Browser performance baseline

Run from the repository root:

```sh
pnpm build
pnpm exec playwright install chromium
bun benchmarks/browser.ts
```

The script writes `benchmarks/browser.json`, including raw samples, source commit,
package and environment versions, and per-file size estimates. It downloads pinned
React dependencies before timing, so it needs internet access during setup.

## What is measured

- Cold startup: supplying `files` to a newly mounted `DevJar` until `onStatusChange`
  reports `ready`. Each of the 10 samples uses a fresh browser context. The host
  application has already loaded; compiler assets and preview dependencies have
  not. Browser-process and operating-system caches may still be warm.
- Warm edits: changing one leaf component until `ready`, with 5 warm-up edits
  excluded and 50 measured edits. Each edit verifies both the new text and retained
  React state. These are sequential edits, not a rapid-typing stress test.
- Two generated projects: 2 files / 1 component and 51 files / 50 components. Each
  component renders a stateful button and a list of 30 items; all components render
  on the page. The larger project has about 23 KB of source, not a large real-world
  application.
- Sizes: raw bytes and gzip estimates for the published runtime module graph,
  lexer, and compiler assets. They exclude React, React DOM, React Refresh, host
  application code, and HTTP headers. Host bundling/minification can change these
  numbers.

Dependencies are served by a local gzip HTTP server. The host uses production
React; the preview uses pinned development React and React Refresh. Chromium runs
headlessly at 1280 × 800 with no network or CPU throttling. Tailwind is disabled.
`ready` means React committed; it does not measure paint or application data loading.

## Recorded baseline

Measured on Apple M4 Pro, darwin 25.6.0 arm64, Chromium 151.0.7922.34.
Source commit: `c34f419`. See [browser.json](./browser.json) for the raw data.

| Project | Cold median | Cold p95 | Warm edit median | Warm edit p95 |
| --- | ---: | ---: | ---: | ---: |
| 2 files | 61.6 ms | 65.3 ms | 1.2 ms | 1.5 ms |
| 51 files | 142.4 ms | 155.7 ms | 9.4 ms | 10.3 ms |

Runtime plus lexer: **18.4 KB gzip**. Compiler worker, binding, and WASM: **639.8 KB gzip**.
KB uses 1,000 bytes. These exclude React and other application dependencies.

## Interpretation

This is a local baseline for tracking Devjar changes. It does not establish internet
startup time, mobile performance, or an advantage over another playground. The
compiler dominates the measured asset sizes and network conditions will materially
change cold startup. The cold p95 is the maximum of only 10 samples, so it is a rough
indicator, not a reliable population tail estimate.

Re-run on the same machine with the same versions and settings when comparing
changes. Retain the raw report and avoid comparing a single best sample. There are
no CI performance thresholds yet.

## Sandpack comparison

```sh
pnpm build
bun benchmarks/compare-sandpack.ts
```

The script installs pinned `@codesandbox/sandpack-client@2.19.8` into a temporary
folder, with install scripts disabled, and removes it afterward. It does not add a
Devjar dependency or change the repository lockfile. Chromium must already be
installed. `BENCHMARK_COLD_SAMPLES` and `BENCHMARK_WARM_SAMPLES` can override the
sample counts for debugging; the recorded run uses 5 and 30 respectively.

Both preview-only adapters run the same generated React 19.2.0 components, without
an editor or Tailwind. Sandpack uses its runtime client and `create-react-app`
template, with an additional mounting entrypoint and HTML file. DevJar uses its
component and default resolver. A layout effect in the edited component sends the
same revision-tagged message to the host for both runtimes. Timing starts before
the host submits files and ends when that message arrives. This measures through
React layout effects plus messaging, not paint; it avoids comparing different
libraries' definitions of a ready event.

Each cold sample has a new browser context, but the browser process, OS DNS/TLS
state, and remote services can warm up. Runtime order alternates between trials.
Dependencies use each tool's normal public services: esm.sh for Devjar, and
Sandpack's hosted bundler/package services for Sandpack. Devjar's compiler is served
locally with gzip, as part of the embedding app. This is a comparison of these
delivery setups, not isolated compiler speed. A self-hosted Sandpack deployment or
different network conditions can change the result. Do not compare these startup
numbers directly with the local-only baseline above.

The warm samples follow five excluded edits and change the same leaf component.
The benchmark checks the rendered text and whether a previously incremented React
counter remains at one. Both runtimes retained state on all 30 measured edits in
both project sizes. The same M4 Pro and Chromium environment as the local baseline
was used. Raw measurements and request records are in
[sandpack.json](./sandpack.json).

| Shared project files | Runtime | Startup median | Startup max | Edit median | Edit p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| 2 | devjar | 182.0 ms | 1263.8 ms | 1.2 ms | 1.5 ms |
| 2 | sandpack | 578.1 ms | 1106.2 ms | 37.7 ms | 38.5 ms |
| 51 | devjar | 271.2 ms | 311.1 ms | 9.0 ms | 11.1 ms |
| 51 | sandpack | 793.3 ms | 920.1 ms | 38.8 ms | 39.6 ms |

Observed startup responses were approximately **0.98 MB for Devjar** and
**2.97 MB for Sandpack**, including the host adapters, compiler/bundler, and React
requests. About 72 KB and 31 KB respectively were the host adapters. These are
Playwright-reported encoded response bodies plus response headers, not npm package
sizes. Collection stops one second after the initial commit. Worker/service-worker
visibility and requests still in flight limit completeness. Each Sandpack trial
had one aborted bundler navigation with unknown transferred bytes; totals exclude
that unknown amount. Full request URLs and missing sizes are retained in the JSON.

Devjar had lower medians in this run, particularly for warm edits. However, the
first small-project startup took 1,264 ms for Devjar versus 1,106 ms for Sandpack.
Five startup samples cannot establish a robust tail distribution or a universal
performance advantage. This supports further evaluation for React documentation
previews, not a claim that Devjar outperforms Sandpack across features or workloads.
