$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptRoot

$null = Get-Command bun -ErrorAction Stop

$distDir = Join-Path $scriptRoot "dist"
$entryFile = Join-Path $distDir "cli-entry.js"
$outFile = Join-Path $distDir "copilot-ralph-linux-x64"

Write-Host "Building project..."
& bun run build

if (-not (Test-Path $entryFile)) {
  throw "Build output not found: $entryFile"
}

Write-Host "Compiling Linux executable..."
& bun build --compile $entryFile --target=bun-linux-x64 --outfile $outFile

Write-Host "Done: $outFile"
