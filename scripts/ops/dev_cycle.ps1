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

function Install-Dependencies {
    param([string]$Path, [string]$Type)
    
    Write-Host "Checking $Type dependencies in $Path..." -ForegroundColor Cyan
    
    if ($Type -eq "Backend") {
        $VenvPath = Join-Path $Path ".venv"
        if (-not (Test-Path $VenvPath)) {
            Write-Host "Virtual environment not found. Creating..." -ForegroundColor Yellow
            python -m venv $VenvPath
        }
        
        Write-Host "Updating backend dependencies..." -ForegroundColor Gray
        $VenvPip = Join-Path $VenvPath "Scripts\pip.exe"
        & $VenvPip install -r (Join-Path $Path "requirements.txt")
    }
    elseif ($Type -eq "Frontend") {
        $NodeModules = Join-Path $Path "node_modules"
        if (-not (Test-Path $NodeModules)) {
            Write-Host "node_modules not found in $Path. Installing..." -ForegroundColor Yellow
            Push-Location $Path
            npm install
            Pop-Location
        }

        Write-Host "Running security audit for $Path..." -ForegroundColor Cyan
        Push-Location $Path
        # Use npm audit. Return code non-zero indicates vulnerabilities found.
        npm audit --audit-level=high
        if ($LASTEXITCODE -ne 0) {
            Write-Host "High/Critical vulnerabilities detected. Attempting to fix..." -ForegroundColor Yellow
            npm audit fix --force
            
            # Re-check after fix
            npm audit --audit-level=high
            if ($LASTEXITCODE -ne 0) {
                Write-Host "WARNING: High/Critical vulnerabilities persist in $Path." -ForegroundColor Yellow
                Write-Host "Continuing anyway, but consider resolving them manually." -ForegroundColor Yellow
            }
            else {
                Write-Host "Vulnerabilities fixed successfully." -ForegroundColor Green
            }
        }
        else {
            Write-Host "Security audit passed." -ForegroundColor Green
        }
        Pop-Location
    }
}

# 0. Check Dependencies
Install-Dependencies -Path $RootDir -Type "Backend"
Install-Dependencies -Path (Join-Path $RootDir "admin-dashboard") -Type "Frontend"
Install-Dependencies -Path (Join-Path $RootDir "system-playground") -Type "Frontend"

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
    }
    else {
        Write-Host "ERROR: Push failed." -ForegroundColor Red
    }
}
else {
    Write-Host "Aborted." -ForegroundColor Yellow
}
