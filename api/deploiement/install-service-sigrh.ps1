# Installe le service Windows SIGRH (NSSM) sur 127.0.0.1:8081.
# Reconstruit d'abord le front : Django sert client/dist, que Git ne versionne pas.
# Le tunnel Cloudflare publie https://sk-partners.consulting/sigrh vers ce port.
# À lancer dans une console administrateur.

$ErrorActionPreference = "Stop"
$nssm = "C:\nssm\nssm.exe"
$python = "C:\Users\SORO\Documents\SIGRH-MPEEP\api\.venv\Scripts\python.exe"
$app = "C:\Users\SORO\Documents\SIGRH-MPEEP\api"
$client = "C:\Users\SORO\Documents\SIGRH-MPEEP\client"
$journal = Join-Path $app "logs\sigrh-service.log"

New-Item -ItemType Directory -Force -Path (Split-Path $journal) | Out-Null

function Invoke-Npm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    # Un avertissement npm ou Vite sur stderr ne doit pas interrompre le script.
    $PSNativeCommandUseErrorActionPreference = $false
    $precedent = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & npm @Arguments
    $code = $LASTEXITCODE
    $ErrorActionPreference = $precedent
    if ($code -ne 0) { throw "npm $($Arguments -join ' ') a échoué (code $code)." }
}

Write-Host "Reconstruction du front..."
Push-Location $client
try {
    Invoke-Npm install
    Invoke-Npm run build
}
finally {
    Pop-Location
}

$existant = Get-Service -Name SIGRH -ErrorAction SilentlyContinue
if ($existant) {
    & $nssm stop SIGRH confirm
    & $nssm remove SIGRH confirm
}

& $nssm install SIGRH $python "manage.py" "runserver" "127.0.0.1:8081" "--noreload"
& $nssm set SIGRH AppDirectory $app
& $nssm set SIGRH AppEnvironmentExtra "SIGRH_ENV_FILE=$app\.env"
& $nssm set SIGRH DisplayName "SIGRH"
& $nssm set SIGRH Description "SIGRH sous /sigrh, origine du tunnel sk-partners.consulting"
& $nssm set SIGRH Start SERVICE_AUTO_START
& $nssm set SIGRH AppStdout $journal
& $nssm set SIGRH AppStderr $journal
& $nssm set SIGRH AppRotateFiles 1
& $nssm set SIGRH AppRotateBytes 1048576
& $nssm set SIGRH AppExit Default Restart
& $nssm set SIGRH AppRestartDelay 5000
& $nssm start SIGRH

Get-Service SIGRH | Format-Table Name, Status, StartType -AutoSize
