# WorldTraffic Control - One-time Setup (Windows PowerShell)
# Run from the project root:  .\scripts\setup.ps1

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir  = Split-Path -Parent $ScriptDir
$BackendDir  = Join-Path $ProjectDir "backend"
$FrontendDir = Join-Path $ProjectDir "frontend"
$VenvDir     = Join-Path $BackendDir ".venv"
$Activate    = Join-Path $VenvDir "Scripts\Activate.ps1"
$PipExe      = Join-Path $VenvDir "Scripts\pip.exe"

Write-Host ""
Write-Host "========================================"
Write-Host "  WorldTraffic Control - Project Setup"
Write-Host "========================================"
Write-Host "Project root : $ProjectDir"
Write-Host ""

# --- Check Python -----------------------------------------------------------
Write-Host "--- Checking Python ---"
$pyFound = $false
try {
    $pyVer = & python --version 2>&1
    Write-Host "  [OK] $pyVer"
    $pyFound = $true
} catch {
    Write-Host "  [FAIL] Python not found."
    Write-Host "  Install Python 3.10+ from https://python.org"
    Write-Host "  Make sure to check 'Add python.exe to PATH' during install."
    Write-Host ""
    exit 1
}

# --- Create virtual environment ---------------------------------------------
Write-Host ""
Write-Host "--- Python virtual environment ---"
if (Test-Path $VenvDir) {
    Write-Host "  [OK] backend\.venv already exists"
} else {
    Write-Host "  [..] Creating backend\.venv ..."
    python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Failed to create virtual environment."
        exit 1
    }
    Write-Host "  [OK] Virtual environment created."
}

# --- Activate and install backend packages ----------------------------------
Write-Host ""
Write-Host "--- Installing backend Python packages ---"
Write-Host "  Activating backend\.venv ..."
. $Activate

Write-Host "  Running: pip install -r backend\requirements.txt"
& $PipExe install --upgrade pip --quiet
& $PipExe install -r "$BackendDir\requirements.txt"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] pip install failed. Check the error output above."
    exit 1
}
Write-Host "  [OK] Backend packages installed."

# --- Copy .env if missing ---------------------------------------------------
Write-Host ""
Write-Host "--- Backend .env file ---"
$BackendEnv = Join-Path $BackendDir ".env"
$EnvExample = Join-Path $ProjectDir ".env.example"
if (Test-Path $BackendEnv) {
    Write-Host "  [OK] backend\.env already exists"
} elseif (Test-Path $EnvExample) {
    Copy-Item $EnvExample $BackendEnv
    Write-Host "  [OK] Created backend\.env from .env.example"
    Write-Host "  [NOTE] Edit backend\.env to set GEMINI_API_KEY if you want camera analysis."
} else {
    Write-Host "  [WARN] No .env.example found. Create backend\.env manually if needed."
}

# --- Node.js / frontend -----------------------------------------------------
Write-Host ""
Write-Host "--- Checking Node.js ---"
$nodeFound = $false
try {
    $nodeVer = & node --version 2>&1
    Write-Host "  [OK] node : $nodeVer"
    $nodeFound = $true
} catch {
    Write-Host "  [FAIL] Node.js not found."
    Write-Host ""
    Write-Host "  The Python backend is set up, but the frontend CANNOT run without Node.js."
    Write-Host "  See: scripts\install-node-help.txt"
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  PARTIAL SETUP COMPLETE"
    Write-Host "========================================"
    Write-Host "  Backend is ready. Frontend needs Node.js."
    Write-Host ""
    Write-Host "  Next steps:"
    Write-Host "    1. Install Node.js LTS from https://nodejs.org"
    Write-Host "    2. Close and reopen PowerShell"
    Write-Host "    3. Run setup again:  .\scripts\setup.ps1"
    Write-Host ""
    exit 0
}

# --- Install frontend npm packages ------------------------------------------
Write-Host ""
Write-Host "--- Installing frontend npm packages ---"
$savedLocation = Get-Location
Set-Location $FrontendDir
Write-Host "  Running: npm install"
npm install
$npmExit = $LASTEXITCODE
Set-Location $savedLocation
if ($npmExit -ne 0) {
    Write-Host "  [FAIL] npm install failed. Check the output above."
    exit 1
}
Write-Host "  [OK] Frontend packages installed."

# --- Done -------------------------------------------------------------------
Write-Host ""
Write-Host "========================================"
Write-Host "  SETUP COMPLETE"
Write-Host "========================================"
Write-Host ""
Write-Host "  You can now run the project:"
Write-Host ""
Write-Host "    Start both   ->  .\scripts\dev.ps1"
Write-Host "    Backend only ->  .\scripts\run-backend.ps1"
Write-Host "    Frontend only->  .\scripts\run-frontend.ps1"
Write-Host ""
Write-Host "  Troubleshooting:"
Write-Host "    Run doctor    ->  .\scripts\doctor.ps1"
Write-Host ""
