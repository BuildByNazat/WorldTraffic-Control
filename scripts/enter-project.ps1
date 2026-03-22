# WorldTraffic Control - Enter Project Shell (PowerShell)
#
# DOT-SOURCE this script to activate the venv in your current window:
#   . .\scripts\enter-project.ps1
#
# The leading dot-space is required so the activation persists
# in your current terminal session.

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$VenvDir    = Join-Path $ProjectDir "backend\.venv"
$Activate   = Join-Path $VenvDir "Scripts\Activate.ps1"

Set-Location $ProjectDir

if (Test-Path $Activate) {
    . $Activate
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  WorldTraffic Control - Shell Ready"
    Write-Host "========================================"
    Write-Host "  Project : $ProjectDir"
    Write-Host "  Venv    : backend\.venv (active)"
    Write-Host ""
    Write-Host "  Commands:"
    Write-Host "    .\scripts\run-backend.ps1   - start FastAPI backend"
    Write-Host "    .\scripts\run-frontend.ps1  - start Vite frontend"
    Write-Host "    .\scripts\dev.ps1           - start both in new windows"
    Write-Host "    .\scripts\doctor.ps1        - check environment health"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[ERROR] Virtual environment not found at backend\.venv"
    Write-Host "  Run:  .\scripts\setup.ps1"
    Write-Host ""
}
