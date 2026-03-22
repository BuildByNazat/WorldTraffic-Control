# WorldTraffic Control - Start Backend
# Run from anywhere:  .\scripts\run-backend.ps1
# Runs in the current window.

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $ProjectDir "backend"
$VenvDir    = Join-Path $BackendDir ".venv"
$Activate   = Join-Path $VenvDir "Scripts\Activate.ps1"

Write-Output ""
Write-Output "--- WorldTraffic Control Backend ---"
Write-Output "Project Root: $ProjectDir"
Write-Output ""

# --- Check venv exists ------------------------------------------------------
if (-not (Test-Path $Activate)) {
    Write-Output "[FAIL] Virtual environment not found at backend\.venv"
    Write-Output "       Please run setup first:  .\scripts\setup.ps1"
    Write-Output ""
    Write-Output "Press Enter to exit..."
    $null = Read-Host
    exit 1
}

# --- Activate venv ----------------------------------------------------------
Write-Output "[STATUS] Activating backend\.venv..."
. $Activate
Write-Output "[OK] Virtual environment activated."
Write-Output ""

# --- Run uvicorn ------------------------------------------------------------
$cmd = "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Write-Output "Executing command: $cmd"
Write-Output "Local Access: http://localhost:8000"
Write-Output "API Docs:     http://localhost:8000/docs"
Write-Output "Press Ctrl+C to stop the server."
Write-Output ""

Set-Location $BackendDir

# Run uvicorn
& uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Check if it exited with an error
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
    Write-Output ""
    Write-Output "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Output "  BACKEND FAILED TO START OR CRASHED"
    Write-Output "  Exit Code: $LASTEXITCODE"
    Write-Output "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Output ""
    Write-Output "Common fixes:"
    Write-Output "- Check if port 8000 is already in use"
    Write-Output "- Check if backend\.env is missing or contains errors"
    Write-Output "- Run .\scripts\doctor.ps1 for more diagnosis"
    Write-Output ""
    Write-Output "Press Enter to close this window..."
    $null = Read-Host
}
