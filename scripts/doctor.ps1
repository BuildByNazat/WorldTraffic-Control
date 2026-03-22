# WorldTraffic Control - Environment Doctor
# Run from anywhere:  .\scripts\doctor.ps1
# Checks that everything needed to run the project is installed and configured.

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir  = Split-Path -Parent $ScriptDir
$BackendDir  = Join-Path $ProjectDir "backend"
$FrontendDir = Join-Path $ProjectDir "frontend"
$VenvDir     = Join-Path $BackendDir ".venv"
$Activate    = Join-Path $VenvDir "Scripts\Activate.ps1"
$PythonExe   = Join-Path $VenvDir "Scripts\python.exe"
$UvicornExe  = Join-Path $VenvDir "Scripts\uvicorn.exe"
$ReqFile     = Join-Path $BackendDir "requirements.txt"
$EnvFile     = Join-Path $BackendDir ".env"
$PackageJson = Join-Path $FrontendDir "package.json"
$NodeModules = Join-Path $FrontendDir "node_modules"

$issues = @()
$warnings = @()

Write-Host ""
Write-Host "========================================"
Write-Host "  WorldTraffic Control - Doctor"
Write-Host "========================================"
Write-Host ""

# --- Paths ------------------------------------------------------------------
Write-Host "--- Paths ---"
Write-Host "  Project root : $ProjectDir"
Write-Host "  Backend      : $BackendDir"
Write-Host "  Frontend     : $FrontendDir"
Write-Host ""

# --- Python (system) --------------------------------------------------------
Write-Host "--- Python (system) ---"
$sysPython = $null
try {
    $sysPython = & python --version 2>&1
    Write-Host "  [OK] python : $sysPython"
} catch {
    Write-Host "  [FAIL] python not found in PATH"
    $issues += "Python is not installed or not in PATH"
}
Write-Host ""

# --- Virtual environment ----------------------------------------------------
Write-Host "--- Virtual environment (backend\.venv) ---"
if (Test-Path $VenvDir) {
    Write-Host "  [OK] .venv directory exists"
} else {
    Write-Host "  [FAIL] .venv not found at $VenvDir"
    $issues += "backend\.venv not found - run .\scripts\setup.ps1"
}

if (Test-Path $Activate) {
    Write-Host "  [OK] Activate.ps1 exists"
} else {
    Write-Host "  [FAIL] Activate.ps1 missing inside .venv"
    $issues += "Activate.ps1 missing - venv may be corrupted, delete backend\.venv and re-run setup"
}

if (Test-Path $PythonExe) {
    $venvPyVer = & $PythonExe --version 2>&1
    Write-Host "  [OK] venv python : $venvPyVer"
} else {
    Write-Host "  [FAIL] python.exe not found inside .venv"
    $issues += "python.exe missing from venv"
}
Write-Host ""

# --- Key Python packages inside venv ----------------------------------------
Write-Host "--- Python packages (inside venv) ---"
if (Test-Path $UvicornExe) {
    Write-Host "  [OK] uvicorn executable found"
} else {
    Write-Host "  [FAIL] uvicorn not found - run .\scripts\setup.ps1"
    $issues += "uvicorn not installed in venv"
}

if (Test-Path $PythonExe) {
    foreach ($pkg in @("fastapi", "sqlalchemy", "pydantic", "httpx", "dotenv")) {
        $result = & $PythonExe -c "import $pkg" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] $pkg"
        } else {
            Write-Host "  [FAIL] $pkg - not importable"
            $issues += "$pkg not installed in venv"
        }
    }
    # google-genai uses a different import path
    $genaiResult = & $PythonExe -c "from google import genai" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] google-genai (optional)"
    } else {
        Write-Host "  [WARN] google-genai not installed (optional - needed for Gemini camera analysis)"
        $warnings += "google-genai not installed - Gemini analysis disabled (set GEMINI_API_KEY in backend\.env to use it)"
    }
}
Write-Host ""

# --- Backend requirements file ----------------------------------------------
Write-Host "--- Backend config ---"
if (Test-Path $ReqFile) {
    Write-Host "  [OK] requirements.txt exists"
} else {
    Write-Host "  [FAIL] requirements.txt not found at $ReqFile"
    $issues += "requirements.txt missing"
}

if (Test-Path $EnvFile) {
    Write-Host "  [OK] backend\.env exists"
    $envContent = Get-Content $EnvFile -Raw
    if ($envContent -match "GEMINI_API_KEY=\S") {
        Write-Host "  [OK] GEMINI_API_KEY is set in .env"
    } else {
        Write-Host "  [WARN] GEMINI_API_KEY not set (camera analysis disabled)"
        $warnings += "GEMINI_API_KEY not set in backend\.env - Gemini analysis disabled"
    }
} else {
    Write-Host "  [WARN] backend\.env not found - copy .env.example to backend\.env"
    $warnings += "backend\.env not found"
}
Write-Host ""

# --- Node / npm -------------------------------------------------------------
Write-Host "--- Node.js ---"
$nodeOk = $false
try {
    $nodeVer = & node --version 2>&1
    Write-Host "  [OK] node : $nodeVer"
    $nodeOk = $true
} catch {
    Write-Host "  [FAIL] node not found in PATH"
    Write-Host "  Run the installer helper: .\scripts\install-node.ps1"
    $issues += "Node.js not installed - frontend cannot run"
}

try {
    $npmVer = & npm --version 2>&1
    Write-Host "  [OK] npm  : $npmVer"
} catch {
    Write-Host "  [FAIL] npm not found"
    $issues += "npm not found"
}

if (Test-Path $PackageJson) {
    Write-Host "  [OK] frontend\package.json exists"
} else {
    Write-Host "  [FAIL] frontend\package.json not found"
    $issues += "frontend\package.json missing"
}

if (Test-Path $NodeModules) {
    Write-Host "  [OK] frontend\node_modules exists"
} else {
    Write-Host "  [WARN] frontend\node_modules not found - run: cd frontend && npm install"
    $warnings += "frontend\node_modules missing - run npm install in the frontend directory"
}
Write-Host ""

# --- Port availability ------------------------------------------------------
Write-Host "--- Port availability ---"
$port8000 = $null
$port5173 = $null

try {
    $port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
} catch {}
try {
    $port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
} catch {}

if ($port8000) {
    $pid8000 = ($port8000 | Select-Object -First 1).OwningProcess
    Write-Host "  [WARN] Port 8000 is already in use (PID $pid8000)"
    $warnings += "Port 8000 in use - backend may fail to start. Close the process or restart the machine."
} else {
    Write-Host "  [OK] Port 8000 is free"
}

if ($port5173) {
    $pid5173 = ($port5173 | Select-Object -First 1).OwningProcess
    Write-Host "  [WARN] Port 5173 is already in use (PID $pid5173)"
    $warnings += "Port 5173 in use - frontend may fail to start."
} else {
    Write-Host "  [OK] Port 5173 is free"
}
Write-Host ""

# --- Summary ----------------------------------------------------------------
Write-Host "========================================"
Write-Host "  Summary"
Write-Host "========================================"

if ($issues.Count -gt 0) {
    Write-Host ""
    Write-Host "  STATUS: NOT READY" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Problems found:"
    foreach ($i in $issues) {
        Write-Host "    [FAIL] $i"
    }
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "  Warnings:"
    foreach ($w in $warnings) {
        Write-Host "    [WARN] $w"
    }
}

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host ""
    Write-Host "  STATUS: READY"
    Write-Host "  Run:  .\scripts\dev.ps1"
} elseif ($issues.Count -eq 0) {
    Write-Host ""
    Write-Host "  STATUS: PARTIALLY READY"
    Write-Host "  The project can start with current setup, but review warnings above."
    Write-Host "  Run:  .\scripts\dev.ps1"
} else {
    Write-Host ""
    Write-Host "  Fix all [FAIL] items above, then run doctor again:  .\scripts\doctor.ps1"
}

Write-Host ""
