# Installe les services Windows SIGRH-Celery (worker) et SIGRH-Celery-Beat (planificateur), comme pour e-MINDERPV.
# Ils lisent api\.env (CELERY_BROKER_URL, Redis du poste) et exécutent personnel/tasks.py.
# À lancer dans une console administrateur.

$ErrorActionPreference = "Stop"
$nssm = "C:\nssm\nssm.exe"
$python = "C:\Users\SORO\Documents\SIGRH-MPEEP\api\.venv\Scripts\python.exe"
$app = "C:\Users\SORO\Documents\SIGRH-MPEEP\api"
$journaux = Join-Path $app "logs"
New-Item -ItemType Directory -Force -Path $journaux | Out-Null

function Installer-Service {
    param([string]$Nom, [string]$Description, [string[]]$Arguments, [string]$Journal)
    $existant = Get-Service -Name $Nom -ErrorAction SilentlyContinue
    if ($existant) {
        & $nssm stop $Nom confirm
        & $nssm remove $Nom confirm
    }
    & $nssm install $Nom $python @Arguments
    & $nssm set $Nom AppDirectory $app
    & $nssm set $Nom AppEnvironmentExtra "SIGRH_ENV_FILE=$app\.env" "PYTHONUTF8=1"
    & $nssm set $Nom DisplayName $Nom
    & $nssm set $Nom Description $Description
    & $nssm set $Nom Start SERVICE_AUTO_START
    & $nssm set $Nom AppStdout (Join-Path $journaux $Journal)
    & $nssm set $Nom AppStderr (Join-Path $journaux $Journal)
    & $nssm set $Nom AppRotateFiles 1
    & $nssm set $Nom AppRotateBytes 1048576
    & $nssm set $Nom AppExit Default Restart
    & $nssm set $Nom AppRestartDelay 5000
    & $nssm start $Nom
}

# Redis doit tourner : le service SIGRH-Celery en dépend.
Installer-Service -Nom "SIGRH-Celery" -Description "Worker Celery de SIGRH (rappels d'échéances et retours)" `
    -Arguments @("-m", "celery", "-A", "config", "worker", "-l", "info", "--pool=threads", "--concurrency=4") -Journal "celery-worker.log"
Installer-Service -Nom "SIGRH-Celery-Beat" -Description "Planificateur Celery beat de SIGRH" `
    -Arguments @("-m", "celery", "-A", "config", "beat", "-l", "info", "-s", (Join-Path $app "logs\celerybeat-schedule")) -Journal "celery-beat.log"
& $nssm set SIGRH-Celery DependOnService Redis
& $nssm set SIGRH-Celery-Beat DependOnService Redis

Get-Service SIGRH, SIGRH-Celery, SIGRH-Celery-Beat | Format-Table Name, Status, StartType -AutoSize
