# WorldTraffic Control - Optional PowerShell Profile Snippet
#
# This file is NOT run automatically.
# It contains a function you can add to your PowerShell profile so that
# typing  wtcontrol  in any terminal jumps into the project and activates the venv.
#
# HOW TO INSTALL:
# ---------------
# 1. Open your PowerShell profile:
#       notepad $PROFILE
#    (PowerShell creates the file automatically if it does not exist.)
#
# 2. Copy the function below into the profile file.
#
# 3. Update the $ProjectPath value to the actual location of this project
#    on your machine.
#
# 4. Save the file and reload the profile:
#       . $PROFILE
#
# 5. Now type  wtcontrol  in any new terminal to enter the project instantly.
#

function wtcontrol {
    # Update this path to match where you put the project on your machine:
    $ProjectPath = "C:\Users\nazat\OneDrive\Desktop\WorldTraffic Control"

    $EnterScript = Join-Path $ProjectPath "scripts\enter-project.ps1"

    if (-not (Test-Path $EnterScript)) {
        Write-Host "[ERROR] Project not found at: $ProjectPath"
        Write-Host "  Update the ProjectPath value in your PowerShell profile."
        return
    }

    # Dot-source so the venv stays active in this shell session
    . $EnterScript
}
