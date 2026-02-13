<#
.SYNOPSIS
    Starts the full development stack (Backend + 2 Frontends) and offers to commit/push.

.DESCRIPTION
    1. Launches backend (FastAPI) in a new window.
    2. Launches admin-dashboard (Next.js) in a new window.
    3. Launches system-playground (Next.js) in a new window.
    4. Waits for user testing.
    5. Prompts to Git Commit & Push.

.EXAMPLE
    .\dev_cycle.ps1
#>

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot

function Start-Window {
    param([string]$Title, [string]$Command, [string]$WorkingDirectory)
    Write-Host "Starting $Title..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { $Command }" -WorkingDirectory $WorkingDirectory
}

# 1. Start Backend
$VenvPython = Join-Path $RootDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    $VenvPython = "python" # Fallback to system python if venv not found
}
# Use factory method as defined in Procfile, but with reload for dev
$BackendCmd = "$VenvPython -m uvicorn src.admin.app:create_app --factory --reload --host 127.0.0.1 --port 8000"
Start-Window -Title "BACKEND (FastAPI)" -Command $BackendCmd -WorkingDirectory $RootDir

# 2. Start Admin Dashboard
$AdminDir = Join-Path $RootDir "admin-dashboard"
Start-Window -Title "FRONTEND (Admin Dashboard)" -Command "npm run dev" -WorkingDirectory $AdminDir

# 3. Start System Playground
$PlaygroundDir = Join-Path $RootDir "system-playground"
Start-Window -Title "FRONTEND (System Playground)" -Command "npm run dev" -WorkingDirectory $PlaygroundDir

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  DEVELOPMENT ENV STARTED" -ForegroundColor Green
Write-Host "  - Backend: http://127.0.0.1:8000/docs"
Write-Host "  - Admin:   http://localhost:3000"
Write-Host "  - System:  http://localhost:3001 (usually)"
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Test your changes now."
Write-Host "Press [ENTER] when you are ready to COMMIT and PUSH..." -ForegroundColor Yellow
Read-Host

# 4. Git Commit & Push
$GitStatus = git status --short
if (-not $GitStatus) {
    Write-Host "No changes detected in git." -ForegroundColor Yellow
    exit
}

Write-Host "Changes detected:" -ForegroundColor Cyan
git status --short

$Confirm = Read-Host "Do you want to commit and push these changes? (y/n)"
if ($Confirm -eq 'y') {
    $Msg = Read-Host "Enter commit message"
    if (-not $Msg) {
        Write-Host "Commit message required. Aborting." -ForegroundColor Red
        exit
    }
    
    Write-Host "Adding all changes..." -ForegroundColor Gray
    git add .
    
    Write-Host "Committing..." -ForegroundColor Gray
    git commit -m "$Msg"
    
    Write-Host "Pushing..." -ForegroundColor Gray
    git push
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS: Pushed to remote." -ForegroundColor Green
    } else {
        Write-Host "ERROR: Push failed." -ForegroundColor Red
    }
} else {
    Write-Host "Aborted." -ForegroundColor Yellow
}
