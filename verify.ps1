<#
.SYNOPSIS
  Runs the whole verification suite: Android, backend, and Firestore rules.

.DESCRIPTION
  The same checks CI runs (.github/workflows/). Use this instead of running the
  three suites by hand — it sorts out the environment, which is the fiddly part
  on Windows.

.EXAMPLE
  .\verify.ps1              # everything
  .\verify.ps1 -Only android
  .\verify.ps1 -Only backend,rules
#>
param(
  [ValidateSet('android', 'backend', 'rules')]
  [string[]] $Only = @('android', 'backend', 'rules')
)

# Deliberately NOT 'Stop'. PowerShell turns a native command's stderr into a
# terminating error under 'Stop', so a single npm deprecation *warning* aborts the
# run. Every step checks $LASTEXITCODE explicitly instead, which is what actually
# indicates failure.
$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$failed = @()

function Section($name) {
  Write-Host ""
  Write-Host "=== $name ===" -ForegroundColor Cyan
}

# --- Environment -------------------------------------------------------------
# Gradle needs a JDK it supports. Android Studio ships one (currently 21), and
# using it avoids depending on whatever JAVA_HOME happens to point at — a newer
# JDK than the toolchain supports fails in confusing ways.
$studioJbr = 'C:\Program Files\Android\Android Studio\jbr'
if (Test-Path $studioJbr) {
  $env:JAVA_HOME = $studioJbr
} elseif (-not $env:JAVA_HOME) {
  Write-Host "No JDK found. Install Android Studio, or set JAVA_HOME to a JDK 17+." -ForegroundColor Red
  exit 1
}

if (-not $env:ANDROID_HOME) {
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk }
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm not found. Install it: npm i -g pnpm  (or: corepack enable)" -ForegroundColor Red
  exit 1
}

Write-Host "JAVA_HOME    : $env:JAVA_HOME"
Write-Host "ANDROID_HOME : $env:ANDROID_HOME"

# --- Android -----------------------------------------------------------------
if ($Only -contains 'android') {
  Section 'Android'
  Push-Location (Join-Path $root 'android')
  try {
    & .\gradlew.bat assembleDebug lintDebug testDebugUnitTest test
    if ($LASTEXITCODE -ne 0) { $failed += 'android' }
  } finally { Pop-Location }
}

# --- Backend -----------------------------------------------------------------
if ($Only -contains 'backend') {
  Section 'Backend'
  Push-Location (Join-Path $root 'backend')
  try {
    # Always. `--frozen-lockfile` is deterministic and, because pnpm hard-links
    # from its global store rather than copying, re-running costs almost nothing.
    # A "does node_modules exist" guard would be actively wrong: an interrupted
    # install leaves the directory behind with binaries missing, which surfaces
    # later as a confusing "tsc is not recognized".
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
      $failed += 'backend:install'
    } else {
      pnpm run lint;  if ($LASTEXITCODE -ne 0) { $failed += 'backend:lint' }
      pnpm test;      if ($LASTEXITCODE -ne 0) { $failed += 'backend:test' }
      pnpm run build; if ($LASTEXITCODE -ne 0) { $failed += 'backend:build' }
    }
  } finally { Pop-Location }
}

# --- Firestore rules ---------------------------------------------------------
if ($Only -contains 'rules') {
  Section 'Firestore rules'
  Push-Location (Join-Path $root 'firebase')
  try {
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
      $failed += 'rules:install'
    } else {
      # The emulator binds 8080 and does not always shut down cleanly, so a
      # previous run can still be holding it. Without this check the failure is
      # just "Could not start Firestore Emulator, port taken", which does not say
      # who took it.
      $held = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
      if ($held) {
        $owner = Get-Process -Id $held[0].OwningProcess -ErrorAction SilentlyContinue
        Write-Host "Port 8080 is held by PID $($held[0].OwningProcess) ($($owner.ProcessName))." -ForegroundColor Yellow
        Write-Host "Likely a Firestore emulator that did not shut down. Stop it with:" -ForegroundColor Yellow
        Write-Host "  Stop-Process -Id $($held[0].OwningProcess) -Force" -ForegroundColor Yellow
        $failed += 'rules:port-8080-taken'
      } else {
        # The emulator is a Java process, so it needs JAVA_HOME too.
        pnpm run test:rules
        if ($LASTEXITCODE -ne 0) { $failed += 'rules' }
      }
    }
  } finally { Pop-Location }
}

# --- Result ------------------------------------------------------------------
Write-Host ""
if ($failed.Count -eq 0) {
  Write-Host "All checks passed." -ForegroundColor Green
  exit 0
} else {
  Write-Host "FAILED: $($failed -join ', ')" -ForegroundColor Red
  exit 1
}
