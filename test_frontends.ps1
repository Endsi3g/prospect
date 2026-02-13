<#
.SYNOPSIS
    Test both frontend applications (lint + build).

.DESCRIPTION
    Validates that admin-dashboard and system-playground compile cleanly.
    Does NOT start any servers or require the backend to be running.

.EXAMPLE
    .\test_frontends.ps1
    .\test_frontends.ps1 -SkipInstall
#>
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path $MyInvocation.MyCommand.Path -Parent

$apps = @(
    @{ Name = "admin-dashboard"; Path = Join-Path $RootDir "admin-dashboard" },
    @{ Name = "system-playground"; Path = Join-Path $RootDir "system-playground" }
)

$results = @()
$failed = $false

foreach ($app in $apps) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Testing: $($app.Name)" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan

    if (-not (Test-Path $app.Path)) {
        Write-Host "  [SKIP] Directory not found: $($app.Path)" -ForegroundColor Yellow
        $results += @{ Name = $app.Name; Status = "SKIPPED" }
        continue
    }

    Push-Location $app.Path
    try {
        # ── Install ──────────────────────────────
        if (-not $SkipInstall) {
            Write-Host "  [1/3] Installing dependencies..." -ForegroundColor Gray
            npm install --prefer-offline --no-audit --no-fund 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed"
            }
            Write-Host "  [1/3] Dependencies OK" -ForegroundColor Green
        }
        else {
            Write-Host "  [1/3] Skipping install (--SkipInstall)" -ForegroundColor Gray
        }

        # ── Lint ─────────────────────────────────
        Write-Host "  [2/3] Running lint..." -ForegroundColor Gray
        $lintOutput = npm run lint 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [2/3] Lint WARNINGS (non-blocking)" -ForegroundColor Yellow
            Write-Host ($lintOutput | Out-String) -ForegroundColor Yellow
        }
        else {
            Write-Host "  [2/3] Lint OK" -ForegroundColor Green
        }

        # ── Build ────────────────────────────────
        Write-Host "  [3/3] Building for production..." -ForegroundColor Gray
        $buildOutput = npm run build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [3/3] BUILD FAILED" -ForegroundColor Red
            Write-Host ($buildOutput | Out-String) -ForegroundColor Red
            $results += @{ Name = $app.Name; Status = "FAILED" }
            $failed = $true
        }
        else {
            Write-Host "  [3/3] Build OK" -ForegroundColor Green
            $results += @{ Name = $app.Name; Status = "PASSED" }
        }
    }
    catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
        $results += @{ Name = $app.Name; Status = "ERROR" }
        $failed = $true
    }
    finally {
        Pop-Location
    }
}

# ── Summary ──────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  RESULTS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

foreach ($r in $results) {
    $color = switch ($r.Status) {
        "PASSED" { "Green" }
        "SKIPPED" { "Yellow" }
        default { "Red" }
    }
    $icon = switch ($r.Status) {
        "PASSED" { "[OK]" }
        "SKIPPED" { "[--]" }
        default { "[!!]" }
    }
    Write-Host "  $icon $($r.Name): $($r.Status)" -ForegroundColor $color
}

Write-Host ""
if ($failed) {
    Write-Host "  Some apps FAILED. Fix errors above before deploying." -ForegroundColor Red
    exit 1
}
else {
    Write-Host "  All frontends are production-ready!" -ForegroundColor Green
    exit 0
}
