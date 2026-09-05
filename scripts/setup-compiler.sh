#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../compiler"

# Install Rust only for source builds. Published npm packages contain the WASM.
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none --no-modify-path
  export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
fi
# The directory's rust-toolchain.toml selects the compiler and WASM target.
cargo --version
if [[ ! -x tools/bin/wasm-bindgen ]] || [[ "$(tools/bin/wasm-bindgen --version)" != 'wasm-bindgen 0.2.114' ]]; then
  cargo install wasm-bindgen-cli --version 0.2.114 --locked --root tools
fi
