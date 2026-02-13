param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("up", "down", "restart", "logs", "check", "ps")]
    [string]$Command,

    [Parameter(Mandatory = $false)]
    [string]$Service = ""
)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

switch ($Command) {
    "up" {
        Write-Step "Starting application stack..."
        docker-compose up -d --build
        Write-Host "Stack is starting. Use './deploy.ps1 check' to verify readiness."
    }
    "down" {
        Write-Step "Stopping application stack..."
        docker-compose down
    }
    "restart" {
        Write-Step "Restarting application stack..."
        docker-compose restart $Service
    }
    "logs" {
        if ($Service) {
            docker-compose logs -f $Service
        }
        else {
            docker-compose logs -f
        }
    }
    "ps" {
        docker-compose ps
    }
    "check" {
        Write-Step "Running health checks..."
        $VenvPython = Join-Path $RootDir ".venv\Scripts\python.exe"
        if (-not (Test-Path $VenvPython)) {
            $VenvPython = "python"
        }
        & $VenvPython (Join-Path $RootDir "scripts\ops\healthcheck.py") --url http://localhost:8000/healthz
        Write-Host "Verifying Playground (UI)..."
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:3001" -TimeoutSec 5 -UseBasicParsing
            Write-Host "  [OK] Playground is accessible."
        }
        catch {
            Write-Warning "Playground UI check failed on :3001"
        }
    }
}
