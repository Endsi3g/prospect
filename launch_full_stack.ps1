$ErrorActionPreference = "Stop"

# Paths
$AppRoot = $PSScriptRoot
$MonitoringDir = Join-Path $AppRoot "monitoring"
$FrontendDir = Join-Path $AppRoot "admin-dashboard"
$ScriptsDir = Join-Path $AppRoot "scripts"

Write-Host "🚀 Launching Prospect Full Stack" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor Cyan

# 1. Environment Check
Write-Host "🔍 Checking environment..." -ForegroundColor Yellow
try {
    docker info > $null 2>&1
    Write-Host "✅ Docker is running." -ForegroundColor Green
}
catch {
    Write-Error "❌ Docker is OFF. Please start Docker Desktop."
    Exit 1
}

# 2. Supabase Start
Write-Host "🐘 Starting Supabase..." -ForegroundColor Yellow
try {
    Set-Location $AppRoot
    Invoke-Expression "npx supabase start"
    Write-Host "✅ Supabase is UP." -ForegroundColor Green
    
    # NEW: Run setup-env.ps1 to prepare .env.local for frontend
    Write-Host "🔑 Setting up environment variables..." -ForegroundColor Yellow
    & ".\scripts\setup-env.ps1"
}
catch {
    Write-Error "❌ Failed to start Supabase or setup environment."
    Set-Location $AppRoot
    Exit 1
}

# 3. Monitoring Start
Write-Host "Starting Monitoring (Prometheus and Grafana)..." -ForegroundColor Yellow
try {
    Set-Location $MonitoringDir
    # Check if prom key is set
    $PromConfig = Get-Content (Join-Path $MonitoringDir "prometheus.yml") -Raw
    if ($PromConfig -match "INSERT_SERVICE_ROLE_KEY_HERE") {
        Write-Warning "⚠️ Service Role Key not set in monitoring/prometheus.yml. Skipping monitoring start."
    }
    else {
        docker-compose up -d
        Write-Host "✅ Monitoring is UP." -ForegroundColor Green
    }
}
catch {
    Write-Warning "⚠️ Failed to start monitoring stack."
}
finally {
    Set-Location $AppRoot
}

# 4. Backend Start
Write-Host "🐍 Starting Backend (FastAPI)..." -ForegroundColor Yellow
$PythonPath = Join-Path $AppRoot ".venv\Scripts\python.exe"
$BackendCmd = "cmd /k `"$PythonPath`" -m uvicorn src.admin.app:create_app --factory --port 8000 --reload"
Start-Process -FilePath "cmd" -ArgumentList "/c start $BackendCmd" -WindowStyle Normal

# 5. Frontend Start (with Changelog)
Write-Host "⚛️ Starting Frontend (Next.js)..." -ForegroundColor Yellow
try {
    Set-Location $FrontendDir
    # npm run dev includes changelog generation
    $FrontendCmd = "cmd /k npm run dev"
    Start-Process -FilePath "cmd" -ArgumentList "/c start $FrontendCmd" -WindowStyle Normal
    Write-Host "✅ Frontend started." -ForegroundColor Green
}
finally {
    Set-Location $AppRoot
}

# 6. Git Operations
Write-Host "Git Backup and Changelog..." -ForegroundColor Yellow
$CommitMsg = Read-Host "Enter commit message (or press Enter to skip)"
if (-not [string]::IsNullOrWhiteSpace($CommitMsg)) {
    git add .
    git commit -m "$CommitMsg"
    # Post-commit hook generates changelog automatically here
    git push origin main
    Write-Host "✅ Changes pushed and changelog updated." -ForegroundColor Green
}
else {
    Write-Host "⏭️ Skipping git operations." -ForegroundColor Gray
}

Write-Host "--------------------------------" -ForegroundColor Cyan
Write-Host "🎉 System Operational!" -ForegroundColor Green
Write-Host "   Frontend:   http://localhost:3000"
Write-Host "   Backend:    http://localhost:8000/docs"
Write-Host "   Supabase:   http://localhost:54323"
Write-Host "   Grafana:    http://localhost:3001"
Write-Host "   Prometheus: http://localhost:9090"
Write-Host "--------------------------------" -ForegroundColor Cyan
Read-Host "Press Enter to exit..."
