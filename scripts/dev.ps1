# WorldTraffic Control - Development Launcher
# Run from anywhere:  .\scripts\dev.ps1
# Opens backend and frontend in separate PowerShell windows.

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir  = Split-Path -Parent $ScriptDir
$BackendDir  = Join-Path $ProjectDir "backend"
$VenvDir     = Join-Path $BackendDir ".venv"
$FrontendDir = Join-Path $ProjectDir "frontend"
$NodeModules = Join-Path $FrontendDir "node_modules"

$BackendScript  = Join-Path $ScriptDir "run-backend.ps1"
$FrontendScript = Join-Path $ScriptDir "run-frontend.ps1"

Write-Output ""
Write-Output "========================================"
Write-Output "  WorldTraffic Control - Dev Launcher"
Write-Output "========================================"
Write-Output ""

# --- Prerequisite: venv -----------------------------------------------------
if (-not (Test-Path $VenvDir)) {
    Write-Output "[FAIL] backend\.venv not found."
    Write-Output "       Please run setup first:  .\scripts\setup.ps1"
    Write-Output ""
    exit 1
}
Write-Output "[OK] backend\.venv exists."

# --- Prerequisite: Node and NPM ---------------------------------------------
try {
    $nodeVer = & node --version 2>&1
    $npmVer = & npm --version 2>&1
    Write-Output "[OK] node: $nodeVer | npm: $npmVer"
} catch {
    Write-Output "[FAIL] Node.js or npm not found."
    Write-Output "       Please install Node.js LTS from https://nodejs.org"
    Write-Output ""
    exit 1
}

# --- Prerequisite: node_modules ---------------------------------------------
if (-not (Test-Path $NodeModules)) {
    Write-Output "[FAIL] frontend\node_modules not found."
    Write-Output "       Please run setup first:  .\scripts\setup.ps1"
    Write-Output ""
    exit 1
}
Write-Output "[OK] frontend\node_modules exists."

# --- Launch backend window --------------------------------------------------
Write-Output ""
Write-Output "[STATUS] Opening backend window..."
Start-Process "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$BackendScript`""

# Brief pause
Start-Sleep -Milliseconds 500

# --- Launch frontend window -------------------------------------------------
Write-Output "[STATUS] Opening frontend window..."
Start-Process "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$FrontendScript`""

# --- Done -------------------------------------------------------------------
Write-Output ""
Write-Output "========================================"
Write-Output "  SERVICES LAUNCHED"
Write-Output "========================================"
Write-Output ""
Write-Output "  Backend API : http://localhost:8000"
Write-Output "  API Docs    : http://localhost:8000/docs"
Write-Output "  Frontend App: http://localhost:5173"
Write-Output ""
Write-Output "  The backend and frontend are running in separate windows."
Write-Output "  If a window crashes, it will stay open for you to read the error."
Write-Output ""
Write-Output "  To stop: Close the two service windows."
Write-Output ""
