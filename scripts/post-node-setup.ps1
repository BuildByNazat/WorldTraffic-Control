# WorldTraffic Control - Post-Node Setup
# Run this AFTER installing Node.js and reopening your terminal.

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $ProjectDir "frontend"

Write-Host ""
Write-Host "========================================"
Write-Host "  Post-Node Setup"
Write-Host "========================================"
Write-Host ""

# --- Verify Node.js ---
Write-Host "[...] Verifying Node.js installation..."
try {
    $nodeVer = & node -v 2>&1
    $npmVer = & npm -v 2>&1
    Write-Host "  [OK] Node.js: $nodeVer"
    Write-Host "  [OK] npm    : $npmVer"
} catch {
    Write-Host "  [FAIL] Node or npm not found in your PATH."
    Write-Host "  If you just installed Node, you MUST CLOSE and REOPEN your terminal."
    Write-Host ""
    exit 1
}

# --- Install Frontend Packages ---
Write-Host ""
Write-Host "[...] Installing frontend dependencies (npm install)..."
$savedLoc = Get-Location
Set-Location $FrontendDir
npm install
$exitCode = $LASTEXITCODE
Set-Location $savedLoc

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "[OK] Frontend dependencies installed successfully."
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  PROJECT READY"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "You can now start the project by running:"
    Write-Host "  .\scripts\dev.ps1"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[ERROR] npm install failed. Please check the errors above."
    Write-Host ""
    exit 1
}
