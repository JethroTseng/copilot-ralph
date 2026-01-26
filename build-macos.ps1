param(
  [ValidateSet("arm64", "x64", "both")]
  [string]$Arch = "both"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptRoot

$null = Get-Command bun -ErrorAction Stop

$distDir = Join-Path $scriptRoot "dist"
$entryFile = Join-Path $distDir "cli-entry.js"

Write-Host "Building project..."
& bun run build

if (-not (Test-Path $entryFile)) {
  throw "Build output not found: $entryFile"
}

$targets = switch ($Arch) {
  "arm64" {
    @(@{ Name = "arm64"; Target = "bun-darwin-arm64"; OutFile = "copilot-ralph-macos-arm64" })
  }
  "x64" {
    @(@{ Name = "x64"; Target = "bun-darwin-x64"; OutFile = "copilot-ralph-macos-x64" })
  }
  Default {
    @(
      @{ Name = "arm64"; Target = "bun-darwin-arm64"; OutFile = "copilot-ralph-macos-arm64" },
      @{ Name = "x64"; Target = "bun-darwin-x64"; OutFile = "copilot-ralph-macos-x64" }
    )
  }
}

foreach ($item in $targets) {
  $outFile = Join-Path $distDir $item.OutFile
  Write-Host "Compiling macOS $($item.Name) executable..."
  & bun build --compile $entryFile --target=$($item.Target) --outfile $outFile
  Write-Host "Done: $outFile"
}
