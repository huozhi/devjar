# Browser compiler

A small Rust wrapper around Oxc compiles JSX/TypeScript in DevJar's browser
worker. It uses ordinary WebAssembly memory through wasm-bindgen, without
WASI, helper threads, or cross-origin isolation headers. The CLI continues
to use the native `oxc-transform` package.

From the repository root:

```sh
pnpm run setup:compiler
pnpm run build:worker
```

Setup installs the Rust toolchain pinned in `rust-toolchain.toml` and
wasm-bindgen-cli 0.2.114 into `compiler/tools`. Builds use the checked-in
Cargo.lock. The worker build also generates static URL references in
`src/generated/compiler-assets.ts` before the library build, so host bundlers
can emit the compiler assets. The JSON manifest is retained for CLI copying,
but is not fetched by the browser. Generated bindings (`pkg`), binaries (`target`), and build tools
(`tools`) are ignored. The npm package ships the generated worker, binding,
and WASM; consumers do not need Rust.

Keep the Oxc crate versions aligned with `oxc-transform` and the wasm-bindgen
crate aligned with the CLI version in `scripts/setup-compiler.sh`. The wrapper
matches `src/transform.ts` with development and Refresh enabled. Update the
browser/native contract test when changing compiler behavior.

`test/browser-compiler.test.ts` verifies compiler behavior against native Oxc.
`scripts/test-package-browser.ts` checks actual iframe updates and React state
preservation without isolation headers. Set `DEVJAR_TEST_BROWSER` to
`chromium`, `firefox`, or `webkit` to select the browser engine.
