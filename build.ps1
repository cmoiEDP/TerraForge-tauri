#!/usr/bin/env pwsh
# build.ps1 — one-shot build for TerraForge Tauri on Windows
# Usage: .\build.ps1               (release)
#        .\build.ps1 -Dev          (dev mode with hot reload)

param([switch]$Dev)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# 1. Build the React frontend
Write-Host "==> Building React frontend..." -ForegroundColor Cyan
Push-Location "$root\frontend"
if (-not (Test-Path "node_modules")) {
    yarn install
    if ($LASTEXITCODE -ne 0) { throw "yarn install failed" }
}
if (-not $Dev) {
    $env:GENERATE_SOURCEMAP = "false"
    yarn build
    if ($LASTEXITCODE -ne 0) { throw "yarn build failed" }
}
Pop-Location

# 2. Build the Tauri shell
Write-Host "==> Building Tauri shell..." -ForegroundColor Cyan
Push-Location "$root\TerraForgeRust\tauri\src-tauri"
if ($Dev) {
    cargo tauri dev
} else {
    cargo build --release
    Write-Host ""
    Write-Host "==> Binary: $root\TerraForgeRust\target\release\terraforge-tauri.exe" -ForegroundColor Green
    Write-Host "==> For full installer (.msi), install tauri-cli and run: cargo tauri build" -ForegroundColor Yellow
}
Pop-Location
