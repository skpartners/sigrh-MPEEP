# Lance l'API Django et le front Vite dans ce terminal.
# Usage (racine du dépôt) :  .\start-dev.ps1
# Réinstalle les paquets du client puis redémarre Vite, pour reprendre le code
# après un git pull. (Le build de production, client/dist, est pour le service Windows.)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$apiDir = Join-Path $root "api"
$clientDir = Join-Path $root "client"

function Resolve-Cmd([string]$Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Commande introuvable : $Name. Installez-la et ouvrez un nouveau terminal."
    }
    return $cmd.Source
}

$uv = Resolve-Cmd "uv"
$npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $npm) {
    $npm = Get-Command "npm" -ErrorAction SilentlyContinue
}
if (-not $npm) {
    throw "Commande introuvable : npm. Installez Node.js et ouvrez un nouveau terminal."
}

function Invoke-Npm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $PSNativeCommandUseErrorActionPreference = $false
    $precedent = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $npm.Source @Arguments
    $code = $LASTEXITCODE
    $ErrorActionPreference = $precedent
    if ($code -ne 0) { throw "npm $($Arguments -join ' ') a échoué (code $code)." }
}

function Stop-ListenPort([int]$Port) {
    $pids = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -gt 0 }
    )
    foreach ($processId in $pids) {
        & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    }
}

$api = $null
$front = $null

function Stop-DevServers {
    foreach ($proc in @($script:api, $script:front)) {
        if ($null -eq $proc) { continue }
        & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null
    }
}

Write-Host "Arrêt des serveurs déjà présents sur 8101 et 9100..."
Stop-ListenPort 8101
Stop-ListenPort 9100
Start-Sleep -Milliseconds 400

Write-Host "Mise à jour des paquets du front..."
Push-Location $clientDir
try {
    Invoke-Npm install
}
finally {
    Pop-Location
}

$api = Start-Process -FilePath $uv -ArgumentList @(
    "run", "python", "manage.py", "runserver", "127.0.0.1:8101"
) -WorkingDirectory $apiDir -NoNewWindow -PassThru

$front = Start-Process -FilePath $npm.Source -ArgumentList @(
    "run", "dev"
) -WorkingDirectory $clientDir -NoNewWindow -PassThru

Write-Host ""
Write-Host "API    http://127.0.0.1:8101"
Write-Host "Front  http://127.0.0.1:9100/sigrh/"
Write-Host "Ctrl+C arrete les deux serveurs."
Write-Host ""

try {
    while ($true) {
        $api.Refresh()
        $front.Refresh()
        if ($api.HasExited -or $front.HasExited) { break }
        Start-Sleep -Milliseconds 400
    }
} finally {
    Stop-DevServers
}
