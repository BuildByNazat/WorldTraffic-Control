# WorldTraffic Control - Start Frontend (Manual)
# Run from current shell:  .\scripts\run-frontend-manual.ps1
# This is identical to run-frontend.ps1 but named for manual use clarity.

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir  = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $ProjectDir "frontend"
$NodeModules = Join-Path $FrontendDir "node_modules"

Write-Output ""
Write-Output "--- WorldTraffic Control Frontend (Manual Mode) ---"
Write-Output "Project Root: $ProjectDir"
Write-Output ""

# --- Check Node available ---------------------------------------------------
try {
    $nodeVer = & node --version 2>&1
    Write-Output "[OK] Node.js version: $nodeVer"
} catch {
    Write-Output "[FAIL] Node.js not found in PATH."
    Write-Output "       Please install Node.js LTS from https://nodejs.org"
    Write-Output ""
    Write-Output "Press Enter to exit..."
    $null = Read-Host
    exit 1
}

# --- Check node_modules exists ----------------------------------------------
if (-not (Test-Path $NodeModules)) {
    Write-Output "[FAIL] frontend\node_modules not found."
    Write-Output "       Please run setup first:  .\scripts\setup.ps1"
    Write-Output ""
    Write-Output "Press Enter to exit..."
    $null = Read-Host
    exit 1
}

# --- Run npm dev ------------------------------------------------------------
$cmd = "npm run dev"
Write-Output "Executing command: $cmd"
Write-Output "Local Access: http://localhost:5173"
Write-Output "Press Ctrl+C to stop the dev server."
Write-Output ""

Set-Location $FrontendDir

# Run npm run dev
& npm run dev

# Check if it exited with an error
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
    Write-Output ""
    Write-Output "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Output "  FRONTEND FAILED TO START OR CRASHED"
    Write-Output "  Exit Code: $LASTEXITCODE"
    Write-Output "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Output ""
    Write-Output "Common fixes:"
    Write-Output "- Check if port 5173 is already in use"
    Write-Output "- Run 'npm install' manually in the frontend folder"
    Write-Output "- Run .\scripts\doctor.ps1 for more diagnosis"
    Write-Output ""
    Write-Output "Press Enter to close this window..."
    $null = Read-Host
}
