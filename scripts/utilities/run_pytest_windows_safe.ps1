param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PytestArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$tmpRoot = Join-Path $repoRoot "manual_test_runs_local\pytest_tmp"
New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

$args = @(
    "-m", "pytest",
    "-o", "addopts=",
    "-p", "no:tmpdir",
    "-p", "no:cacheprovider",
    "-p", "tests.pytest_windows_tmp_plugin"
) + $PytestArgs

& python @args
exit $LASTEXITCODE

