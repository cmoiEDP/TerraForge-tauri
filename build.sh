#!/usr/bin/env bash
# build.sh — one-shot build for TerraForge Tauri on macOS / Linux
# Usage: ./build.sh            (release)
#        ./build.sh --dev      (dev mode with hot reload)

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV=0
[[ "$1" == "--dev" ]] && DEV=1

echo "==> Building React frontend..."
cd "$ROOT/frontend"
[ -d node_modules ] || yarn install
if [ $DEV -eq 0 ]; then
    GENERATE_SOURCEMAP=false yarn build
fi

echo "==> Building Tauri shell..."
cd "$ROOT/TerraForgeRust/tauri/src-tauri"
if [ $DEV -eq 1 ]; then
    cargo tauri dev
else
    cargo build --release
    echo ""
    echo "==> Binary: $ROOT/TerraForgeRust/target/release/terraforge-tauri"
    echo "==> For full installer, install tauri-cli and run: cargo tauri build"
fi
