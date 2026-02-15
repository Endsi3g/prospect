<#
.SYNOPSIS
    Commits and pushes all changes in the repository in one block.

.DESCRIPTION
    1. Stages all changes (including untracked files).
    2. Commits with a provided message (or a default "Bulk update").
    3. Pushes to the current branch.

.EXAMPLE
    .\git_sync.ps1 -Message "Implemented new features and fixed builds"
    .\git_sync.ps1 "Fixed responsive UI"
#>
param(
    [Parameter(Position=0)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

# Verify we are in a git repo
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Not a git repository." -ForegroundColor Red
    exit 1
}

$status = git status --short
if (-not $status) {
    Write-Host "No changes to commit." -ForegroundColor Yellow
    exit 0
}

Write-Host "Changes detected:" -ForegroundColor Cyan
git status --short

if (-not $Message) {
    Write-Host ""
    $Message = Read-Host "No message provided. Enter commit message (or Esc to cancel)"
    if (-not $Message) {
        Write-Host "Aborted. Commit message is required." -ForegroundColor Red
        exit 1
    }
}

try {
    Write-Host "`n[1/3] Staging all changes..." -ForegroundColor Gray
    git add .

    Write-Host "[2/3] Committing as a single block..." -ForegroundColor Gray
    git commit -m "$Message"

    Write-Host "[3/3] Pushing to remote..." -ForegroundColor Gray
    git push

    Write-Host "`nSUCCESS: All changes committed and pushed." -ForegroundColor Green
}
catch {
    Write-Host "`nERROR: Git operation failed." -ForegroundColor Red
    Write-Error $_
}
