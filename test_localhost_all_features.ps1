param(
    [switch]$SkipUnitTests,
    [switch]$SkipFrontendBuild,
    [switch]$KeepRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$RootDir = $PSScriptRoot
$StartScript = Join-Path $RootDir "scripts\ops\start_localhost_one_shot.ps1"
$StopScript = Join-Path $RootDir "scripts\ops\stop_localhost.ps1"
$DotEnvPath = Join-Path $RootDir ".env"
$FrontendDir = Join-Path $RootDir "admin-dashboard"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "== $Message =="
}

function Assert-Condition([bool]$Condition, [string]$ErrorMessage) {
    if (-not $Condition) {
        throw $ErrorMessage
    }
}

function Get-EnvValueFromDotEnv([string]$Key) {
    if (-not (Test-Path $DotEnvPath)) {
        return $null
    }

    $pattern = "^\s*${Key}\s*=\s*(.+?)\s*$"
    foreach ($line in Get-Content $DotEnvPath) {
        if ($line -match $pattern) {
            $value = $Matches[1].Trim()
            if ($value.StartsWith('"') -and $value.EndsWith('"')) {
                return $value.Trim('"')
            }
            if ($value.StartsWith("'") -and $value.EndsWith("'")) {
                return $value.Trim("'")
            }
            return $value
        }
    }
    return $null
}

function Wait-ForUrl([string]$Url, [int]$MaxAttempts = 60) {
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "Timeout while waiting for $Url"
}

function Invoke-AdminApi([string]$Method, [string]$Path, $Payload, [hashtable]$Headers) {
    $url = "http://localhost:8000$Path"
    if ($null -eq $Payload) {
        return Invoke-RestMethod -Method $Method -Uri $url -Headers $Headers -TimeoutSec 10
    }
    return Invoke-RestMethod -Method $Method -Uri $url -Headers $Headers -ContentType "application/json" -Body ($Payload | ConvertTo-Json -Depth 10) -TimeoutSec 10
}

function Invoke-AdminApiMultipart(
    [string]$Path,
    [string]$CsvContent,
    [string]$Table,
    [hashtable]$Headers
) {
    $tmpFile = Join-Path ([System.IO.Path]::GetTempPath()) ("prospect_import_" + [Guid]::NewGuid().ToString("N") + ".csv")
    try {
        Set-Content -Path $tmpFile -Value $CsvContent -Encoding UTF8
        $client = [System.Net.Http.HttpClient]::new()
        $request = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::Post,
            "http://localhost:8000$Path"
        )
        foreach ($header in $Headers.GetEnumerator()) {
            [void]$request.Headers.TryAddWithoutValidation($header.Key, [string]$header.Value)
        }

        $multipart = [System.Net.Http.MultipartFormDataContent]::new()
        $fileBytes = [System.IO.File]::ReadAllBytes($tmpFile)
        $fileContent = [System.Net.Http.ByteArrayContent]::new($fileBytes)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("text/csv")
        $multipart.Add($fileContent, "file", [System.IO.Path]::GetFileName($tmpFile))
        $multipart.Add([System.Net.Http.StringContent]::new($Table), "table")
        $request.Content = $multipart

        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "Multipart API request failed: $($response.StatusCode) $raw"
        }
        return $raw | ConvertFrom-Json
    }
    finally {
        if (Test-Path $tmpFile) {
            Remove-Item $tmpFile -Force
        }
    }
}

$startedStack = $false

try {
    if (-not $SkipUnitTests) {
        Write-Step "Running backend unit tests"
        Push-Location $RootDir
        python -m pytest -q
        Pop-Location
    }

    if (-not $SkipFrontendBuild) {
        Write-Step "Running frontend build"
        Push-Location $FrontendDir
        npm.cmd run build
        Pop-Location
    }

    Write-Step "Starting localhost stack"
    & $StartScript
    $startedStack = $true

    Write-Step "Waiting for backend and frontend"
    Wait-ForUrl -Url "http://localhost:8000/healthz" -MaxAttempts 60
    Wait-ForUrl -Url "http://localhost:3000/dashboard" -MaxAttempts 90

    $adminUser = $env:ADMIN_USERNAME
    if (-not $adminUser) { $adminUser = Get-EnvValueFromDotEnv "ADMIN_USERNAME" }
    if (-not $adminUser) { $adminUser = "admin" }

    $adminPassword = $env:ADMIN_PASSWORD
    if (-not $adminPassword) { $adminPassword = Get-EnvValueFromDotEnv "ADMIN_PASSWORD" }
    if (-not $adminPassword) { $adminPassword = "change-me" }

    $pair = "${adminUser}:${adminPassword}"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    $headers = @{
        Authorization = "Basic $encoded"
    }

    Write-Step "API smoke tests"
    $health = Invoke-RestMethod -Method GET -Uri "http://localhost:8000/healthz" -TimeoutSec 10
    Assert-Condition ($health.ok -eq $true) "Healthcheck returned not ok."

    $stats = Invoke-AdminApi -Method GET -Path "/api/v1/admin/stats" -Payload $null -Headers $headers
    Assert-Condition ($null -ne $stats.sourced_total) "Stats payload missing sourced_total."

    $runId = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $leadEmail = "smoke+$runId@example.com"

    $leadPayload = @{
        first_name   = "Smoke"
        last_name    = "Test"
        email        = $leadEmail
        phone        = "+1-555-0101"
        company_name = "Smoke Corp"
        status       = "NEW"
        segment      = "General"
    }
    $createdLead = Invoke-AdminApi -Method POST -Path "/api/v1/admin/leads" -Payload $leadPayload -Headers $headers
    Assert-Condition ($createdLead.email -eq $leadEmail) "Lead creation failed."

    $leads = Invoke-AdminApi -Method GET -Path "/api/v1/admin/leads?page=1&page_size=100" -Payload $null -Headers $headers
    $leadExists = $false
    foreach ($item in $leads.items) {
        if ($item.email -eq $leadEmail) {
            $leadExists = $true
            break
        }
    }
    Assert-Condition $leadExists "Created lead not found in lead list."

    $taskPayload = @{
        title       = "Smoke task $runId"
        status      = "To Do"
        priority    = "Medium"
        assigned_to = "You"
        lead_id     = $createdLead.id
    }
    $createdTask = Invoke-AdminApi -Method POST -Path "/api/v1/admin/tasks" -Payload $taskPayload -Headers $headers
    Assert-Condition ($createdTask.title -eq $taskPayload.title) "Task creation failed."

    $updatedTask = Invoke-AdminApi -Method PATCH -Path "/api/v1/admin/tasks/$($createdTask.id)" -Payload @{
        status   = "Done"
        priority = "High"
    } -Headers $headers
    Assert-Condition ($updatedTask.status -eq "Done") "Task update failed."

    $tasks = Invoke-AdminApi -Method GET -Path "/api/v1/admin/tasks" -Payload $null -Headers $headers
    Assert-Condition (($tasks | Measure-Object).Count -gt 0) "Tasks list is empty."

    $deletedTask = Invoke-AdminApi -Method DELETE -Path "/api/v1/admin/tasks/$($createdTask.id)" -Payload $null -Headers $headers
    Assert-Condition ($deletedTask.deleted -eq $true) "Task deletion failed."

    $projectPayload = @{
        name        = "Smoke project $runId"
        description = "Created by localhost smoke script."
        status      = "Planning"
        lead_id     = $createdLead.id
        due_date    = (Get-Date).AddDays(7).ToString("s")
    }
    $createdProject = Invoke-AdminApi -Method POST -Path "/api/v1/admin/projects" -Payload $projectPayload -Headers $headers
    Assert-Condition ($createdProject.name -eq $projectPayload.name) "Project creation failed."

    $updatedProject = Invoke-AdminApi -Method PATCH -Path "/api/v1/admin/projects/$($createdProject.id)" -Payload @{ status = "Completed" } -Headers $headers
    Assert-Condition ($updatedProject.status -eq "Completed") "Project update failed."

    $projects = Invoke-AdminApi -Method GET -Path "/api/v1/admin/projects" -Payload $null -Headers $headers
    Assert-Condition (($projects | Measure-Object).Count -gt 0) "Projects list is empty."

    $analytics = Invoke-AdminApi -Method GET -Path "/api/v1/admin/analytics" -Payload $null -Headers $headers
    Assert-Condition ($null -ne $analytics.total_leads) "Analytics payload missing total_leads."

    $settings = Invoke-AdminApi -Method GET -Path "/api/v1/admin/settings" -Payload $null -Headers $headers
    Assert-Condition ($null -ne $settings.support_email) "Settings payload missing support_email."

    $settingsUpdate = @{
        organization_name         = $settings.organization_name
        locale                    = $settings.locale
        timezone                  = $settings.timezone
        default_page_size         = [int]$settings.default_page_size
        dashboard_refresh_seconds = [int]$settings.dashboard_refresh_seconds
        support_email             = $settings.support_email
    }
    $savedSettings = Invoke-AdminApi -Method PUT -Path "/api/v1/admin/settings" -Payload $settingsUpdate -Headers $headers
    Assert-Condition ($savedSettings.support_email -eq $settings.support_email) "Settings update/readback failed."

    $search = Invoke-AdminApi -Method GET -Path "/api/v1/admin/search?q=smoke&limit=10" -Payload $null -Headers $headers
    Assert-Condition ($null -ne $search.total) "Search payload invalid."

    $help = Invoke-AdminApi -Method GET -Path "/api/v1/admin/help" -Payload $null -Headers $headers
    Assert-Condition (($help.faqs | Measure-Object).Count -gt 0) "Help payload missing FAQ entries."

    $csvPreviewContent = @"
first_name,last_name,email,company_name,status,segment
Csv,Preview,preview+$runId@example.com,Csv Corp,NEW,General
"@
    $csvPreview = Invoke-AdminApiMultipart -Path "/api/v1/admin/import/csv/preview" -CsvContent $csvPreviewContent -Table "leads" -Headers $headers
    Assert-Condition ($csvPreview.valid_rows -ge 1) "CSV preview failed."

    $csvCommitContent = @"
first_name,last_name,email,company_name,status,segment
Csv,Commit,commit+$runId@example.com,Csv Corp,NEW,General
"@
    $csvCommit = Invoke-AdminApiMultipart -Path "/api/v1/admin/import/csv/commit" -CsvContent $csvCommitContent -Table "leads" -Headers $headers
    Assert-Condition ($csvCommit.created -ge 1) "CSV commit failed."

    $diagnosticsLatest = Invoke-AdminApi -Method GET -Path "/api/v1/admin/diagnostics/latest" -Payload $null -Headers $headers
    Assert-Condition ($null -ne $diagnosticsLatest.available) "Diagnostics latest payload invalid."

    $autofixLatest = Invoke-AdminApi -Method GET -Path "/api/v1/admin/autofix/latest" -Payload $null -Headers $headers
    Assert-Condition ($null -ne $autofixLatest.available) "Autofix latest payload invalid."

    Write-Step "Running Python verification scripts"
    
    Write-Host "Verifying filtering/sorting/pagination..."
    python tests/verify_filters.py
    if ($LASTEXITCODE -ne 0) { throw "Filters verification failed." }

    Write-Host "Verifying new admin features (Account/Billing/Notifications/Reports)..."
    python tests/verify_admin_features.py
    if ($LASTEXITCODE -ne 0) { throw "Admin features verification failed." }

    Write-Step "Frontend smoke tests"
    $frontendPaths = @(
        "/dashboard",
        "/leads",
        "/tasks",
        "/projects",
        "/settings",
        "/help",
        "/analytics"
    )
    foreach ($path in $frontendPaths) {
        $response = Invoke-WebRequest -Uri ("http://localhost:3000$path") -TimeoutSec 10 -UseBasicParsing
        Assert-Condition ($response.StatusCode -eq 200) "Frontend route failed: $path"
    }

    Write-Host ""
    Write-Host "All localhost tests passed successfully."
    Write-Host "Lead: $leadEmail"
    Write-Host "Project: $($createdProject.id)"
    Write-Host "Task: $($createdTask.id)"
}
finally {
    if ($startedStack -and -not $KeepRunning) {
        Write-Step "Stopping localhost stack"
        & $StopScript
    }
}
