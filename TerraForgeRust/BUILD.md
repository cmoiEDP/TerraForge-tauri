# Tauri build — quick reference

## TL;DR (Windows / macOS / Linux)

### Option 1 — `cargo tauri build` (recommended, one command)
```bash
cargo install tauri-cli --version "^2"     # one-time
cd TerraForgeRust/tauri/src-tauri
cargo tauri build
```
This runs `yarn build` in `frontend/` automatically via `beforeBuildCommand`, then compiles the Rust shell. Output bundles land in `TerraForgeRust/target/release/bundle/`.

### Option 2 — Plain `cargo build` (if you can't / won't install tauri-cli)
You **must** build the frontend first because `cargo build` does NOT run `beforeBuildCommand`:

```bash
cd frontend
yarn install
yarn build

cd ../TerraForgeRust/tauri/src-tauri
cargo build --release
```

### Option 3 — Dev mode (hot reload)
```bash
cd TerraForgeRust/tauri/src-tauri
cargo tauri dev
```
Auto-launches the React dev server on `localhost:3000` and embeds it in a native window. First start ~1-2 min (Rust deps compile).

## Errors you might hit

### `The `frontendDist` configuration is set to "../../../frontend/build" but this path doesn't exist`
→ You ran `cargo build` without first running `yarn build` in `frontend/`. See Option 2 above.

### `icons/icon.ico not found`
→ Should NOT happen with this repo (icons are committed in `TerraForgeRust/tauri/src-tauri/icons/`). If you're seeing it, you're on an older checkout — `git pull`.

### Windows: linker errors mentioning `link.exe`
→ Install Visual Studio Build Tools 2022 with the "Desktop development with C++" workload.

### Linux: `webkit2gtk` / `gtk-3` not found
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file libssl-dev
```

### macOS: `xcrun: error: invalid active developer path`
```bash
xcode-select --install
```

## Build output locations

| Platform | Files |
|----------|-------|
| Windows  | `target/release/bundle/msi/*.msi` + `target/release/bundle/nsis/*.exe` |
| macOS    | `target/release/bundle/dmg/*.dmg` + `target/release/bundle/macos/*.app` |
| Linux    | `target/release/bundle/deb/*.deb` + `target/release/bundle/appimage/*.AppImage` |

Plain `cargo build --release` (no `tauri build`) produces just the bare executable at `target/release/terraforge-tauri[.exe]` — no installer, no icon resource bundling.
