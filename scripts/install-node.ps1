# WorldTraffic Control - Node.js Installer (Windows)
# This script attempts to install Node.js LTS using Windows Package Manager (winget).

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "========================================"
Write-Host "  Node.js Installation Helper"
Write-Host "========================================"
Write-Host ""

# --- Check for winget ---
Write-Host "[...] Checking for Windows Package Manager (winget)..."
$winget = Get-Command winget -ErrorAction SilentlyContinue

if ($winget) {
    Write-Host "[OK] winget found."
    Write-Host "[...] Attempting to install Node.js LTS via winget..."
    Write-Host "    Command: winget install OpenJS.NodeJS.LTS"
    Write-Host ""
    
    # Run winget
    winget install OpenJS.NodeJS.LTS
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================"
        Write-Host "  INSTALLATION SUCCESSFUL"
        Write-Host "========================================"
        Write-Host ""
        Write-Host "IMPORTANT NEXT STEPS:"
        Write-Host "  1. FULLY CLOSE this PowerShell window."
        Write-Host "  2. OPEN A NEW PowerShell window."
        Write-Host "  3. Verify the installation by running:"
        Write-Host "     node -v"
        Write-Host "     npm -v"
        Write-Host "  4. Then run the final setup script:"
        Write-Host "     .\scripts\post-node-setup.ps1"
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "[ERROR] winget failed to install Node.js."
        Write-Host "Please follow the manual instructions below."
    }
} else {
    Write-Host "[WARN] winget not found on this system."
    Write-Host ""
    Write-Host "MANUAL INSTALLATION INSTRUCTIONS:"
    Write-Host "---------------------------------"
    Write-Host "1. Go to: https://nodejs.org"
    Write-Host "2. Download the 'LTS' version (Long Term Support)."
    Write-Host "3. Run the installer and accept all defaults."
    Write-Host "4. RESTART your terminal (close and reopen) after install."
    Write-Host "5. Verify with 'node -v' and 'npm -v'."
    Write-Host "6. Then run: .\scripts\post-node-setup.ps1"
    Write-Host ""
}

Write-Host "Press any key to exit..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
