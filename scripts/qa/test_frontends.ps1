<#
.SYNOPSIS
    Test both frontend applications (lint + build).

.DESCRIPTION
    Validates that admin-dashboard and system-playground compile cleanly.
    Does not start any servers unless -StartMock is provided.

.EXAMPLE
    .\test_frontends.ps1
    .\test_frontends.ps1 -SkipInstall
    .\test_frontends.ps1 -StartMock
#>
param(
    [switch]$SkipInstall,
    [switch]$StartMock
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path $MyInvocation.MyCommand.Path -Parent

$apps = @(
    @{ Name = "admin-dashboard"; Path = Join-Path $RootDir "admin-dashboard" },
    @{ Name = "system-playground"; Path = Join-Path $RootDir "system-playground" }
)

$results = @()
$failed = $false

# Pre-flight check: APP_ENCRYPTION_KEY
$envFile = Join-Path $RootDir ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -notmatch "APP_ENCRYPTION_KEY=[a-zA-Z0-9_-]{32,}") {
        Write-Host "  [WARN] APP_ENCRYPTION_KEY missing or invalid in .env. Secrets management may fail." -ForegroundColor Yellow
    }
}

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

    # Verify proxy.ts if it's admin-dashboard
    if ($app.Name -eq "admin-dashboard") {
        $proxyPath = Join-Path $app.Path "proxy.ts"
        if (-not (Test-Path $proxyPath)) {
            Write-Host "  [ERROR] proxy.ts (new convention) not found in admin-dashboard." -ForegroundColor Red
            $results += @{ Name = $app.Name; Status = "MISSING_PROXY" }
            $failed = $true
            continue
        }
    }

    Push-Location $app.Path
    try {
        # Install dependencies
        if (-not $SkipInstall) {
            Write-Host "  [1/3] Installing dependencies..." -ForegroundColor Gray
            $installOutput = npm install --prefer-offline --no-audit --no-fund 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed:`n$($installOutput | Out-String)"
            }
            Write-Host "  [1/3] Dependencies OK" -ForegroundColor Green
        }
        else {
            Write-Host "  [1/3] Skipping install (--SkipInstall)" -ForegroundColor Gray
        }

        # Lint
        Write-Host "  [2/3] Running lint..." -ForegroundColor Gray
        $lintOutput = npm run lint 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [2/3] Lint WARNINGS (non-blocking)" -ForegroundColor Yellow
            Write-Host ($lintOutput | Out-String) -ForegroundColor Yellow
        }
        else {
            Write-Host "  [2/3] Lint OK" -ForegroundColor Green
        }

        # Build
        Write-Host "  [3/3] Building for production..." -ForegroundColor Gray
        $prevAction = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $buildOutput = npm run build 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevAction

        if ($exitCode -ne 0) {
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

if ($failed) {
    Write-Host ""
    Write-Host "  Some apps FAILED. Fix errors above before deploying." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  All frontends are production-ready!" -ForegroundColor Green

if (-not $StartMock) {
    exit 0
}

function Start-MockApp {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port
    )

    Write-Host "    Starting $Name on http://localhost:$Port (Mock Mode)..." -ForegroundColor Gray
    $command = "cd '$Path'; `$env:NEXT_PUBLIC_USE_MOCK='true'; `$env:PORT='$Port'; npm run dev"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $command
}

Write-Host ""
Write-Host "  Starting frontends with NEXT_PUBLIC_USE_MOCK=true..." -ForegroundColor Cyan

$AdminPath = Join-Path $RootDir "admin-dashboard"
Start-MockApp -Path $AdminPath -Name "Admin Dashboard" -Port 3000

$PlaygroundPath = Join-Path $RootDir "system-playground"
Start-MockApp -Path $PlaygroundPath -Name "System Playground" -Port 3001

Write-Host "  Apps started in new windows." -ForegroundColor Green
exit 0
