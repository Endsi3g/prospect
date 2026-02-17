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
$isGitRepo = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0 -or "$isGitRepo".Trim().ToLower() -ne "true") {
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
    $Message = Read-Host "No message provided. Enter commit message (leave blank for default: Bulk update)"
}

if ($null -eq $Message -or $Message.Trim() -eq "") {
    $Message = "Bulk update"
}

try {
    Write-Host "`n[1/3] Staging all changes..." -ForegroundColor Gray
    git add .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git add failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "[2/3] Committing as a single block..." -ForegroundColor Gray
    git commit -m "$Message"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git commit failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "[3/3] Pushing to remote..." -ForegroundColor Gray
    git push
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git push failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "`nSUCCESS: All changes committed and pushed." -ForegroundColor Green
}
catch {
    Write-Host "`nERROR: Git operation failed." -ForegroundColor Red
    Write-Error $_
}
