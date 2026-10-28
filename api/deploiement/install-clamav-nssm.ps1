<#
.SYNOPSIS
  Installe ClamAV (Windows) comme services NSSM (service PARTAGE : a ne lancer que si ClamAV-Daemon est absent, verifier avec verifier-clamav.ps1) : demon clamd (TCP 127.0.0.1:3310) + mise a jour automatique des signatures.

.DESCRIPTION
  - Le code (personnel/antivirus.py) joint le demon sur 127.0.0.1:3310 (protocole INSTREAM) : en prod le scan est
    obligatoire, sans demon tout televersement est refuse.
  - Services crees : ClamAV-Daemon (clamd) et ClamAV-Freshclam (freshclam en mode demon, 12 controles/jour).
  - Ecoute locale uniquement (127.0.0.1). Base de signatures dans C:\ClamAV\db (telechargee a l'installation).
  - Rechargement concurrent de la base desactive : evite de doubler la memoire (~1,3 Go -> ~2,6 Go) a chaque mise a jour.
  - Idempotent. Droits administrateur requis. Acces internet requis (database.clamav.net) pour la premiere base.

.EXAMPLE
  .\install-clamav-nssm.ps1 -SourceDir C:\temp\clamav-extrait\clamav-1.5.4.win.x64
#>
param(
    [Parameter(Mandatory = $true)][string]$SourceDir,
    [string]$InstallDir = 'C:\ClamAV',
    [int]$Port = 3310,
    [string]$MaxSize = '512M'
)

$ErrorActionPreference = 'Stop'

$nssm = if (Test-Path 'C:\nssm\nssm.exe') { 'C:\nssm\nssm.exe' } else { (Get-Command nssm -ErrorAction SilentlyContinue).Source }
$daemonSvc = 'ClamAV-Daemon'
$freshSvc = 'ClamAV-Freshclam'

function Write-Step([string]$msg) { Write-Host ("[clamav] {0}" -f $msg) -ForegroundColor Cyan }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Droits administrateur requis.' }
if (-not $nssm) { throw "NSSM introuvable (PATH, Program Files ou C:
ssm) : installer NSSM dans C:\nssm" }
foreach ($exe in 'clamd.exe', 'freshclam.exe') {
    if (-not (Test-Path (Join-Path $SourceDir $exe))) { throw "$exe absent de $SourceDir" }
}

$existingDaemon = Get-Service -Name $daemonSvc -ErrorAction SilentlyContinue
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener -and -not $existingDaemon) { throw "Le port $Port est deja utilise (PID $($listener[0].OwningProcess))." }

Write-Step 'Arret des services existants (si presents)'
foreach ($name in $freshSvc, $daemonSvc) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne 'Stopped') { Stop-Service -Name $name -Force; Start-Sleep -Seconds 2 }
}

Write-Step "Copie des binaires vers $InstallDir"
$db = Join-Path $InstallDir 'db'
$logs = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Force -Path $InstallDir, $db, $logs | Out-Null
Copy-Item -Path (Join-Path $SourceDir '*') -Destination $InstallDir -Recurse -Force

Write-Step 'Ecriture des configurations'
$clamdConf = Join-Path $InstallDir 'clamd.conf'
$freshConf = Join-Path $InstallDir 'freshclam.conf'
# Chemins Windows (barres inverses) : ClamAV 1.4.6 pour Windows refuse DatabaseDirectory avec des barres
# obliques (il croit le dossier absent : Failed to create database directory), contrairement aux versions 1.x
# precedentes. Meme format pour les journaux.
$dbWin = $db
$logWin = $logs
@"
# Gere par api/deploiement/install-clamav-nssm.ps1 - ne pas editer a la main.
DatabaseDirectory $dbWin
LogFile $logWin\clamd.log
LogTime yes
LogFileMaxSize 5M
Foreground yes
TCPSocket $Port
TCPAddr 127.0.0.1
MaxThreads 8
MaxFileSize $MaxSize
StreamMaxLength $MaxSize
ConcurrentDatabaseReload no
SelfCheck 600
"@ | Set-Content -LiteralPath $clamdConf -Encoding ASCII
@"
# Gere par api/deploiement/install-clamav-nssm.ps1 - ne pas editer a la main.
DatabaseDirectory $dbWin
UpdateLogFile $logWin\freshclam.log
LogTime yes
DatabaseMirror database.clamav.net
Checks 12
"@ | Set-Content -LiteralPath $freshConf -Encoding ASCII

Write-Step 'Telechargement de la base de signatures (freshclam, quelques minutes)'
& (Join-Path $InstallDir 'freshclam.exe') "--config-file=$freshConf"
if ($LASTEXITCODE -ne 0) { throw "freshclam a echoue (code $LASTEXITCODE) - verifier l'acces internet, journal : $logs\freshclam.log" }
$sigs = Get-ChildItem -Path $db -Include '*.cvd', '*.cld' -Recurse -ErrorAction SilentlyContinue
if (-not $sigs) { throw "Aucune base de signatures dans $db" }
Write-Step ("{0} fichier(s) de signatures" -f @($sigs).Count)
# Une fois le demon installe, freshclam le previent a chaque mise a jour (ajoute apres le 1er telechargement :
# clamd ne tourne pas encore et freshclam sortirait en erreur).
Add-Content -LiteralPath $freshConf -Value "NotifyClamd $clamdConf" -Encoding ASCII

function Set-NssmService([string]$name, [string]$exe, [string]$arguments, [string]$display, [string]$desc, [string]$stdout, [string]$stderr) {
    if (-not (Get-Service -Name $name -ErrorAction SilentlyContinue)) {
        & $nssm install $name $exe $arguments | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "nssm install $name a echoue" }
    } else {
        & $nssm set $name Application $exe | Out-Null
        & $nssm set $name AppParameters $arguments | Out-Null
    }
    & $nssm set $name AppDirectory $InstallDir | Out-Null
    & $nssm set $name DisplayName $display | Out-Null
    & $nssm set $name Description $desc | Out-Null
    & $nssm set $name Start SERVICE_AUTO_START | Out-Null
    & $nssm set $name AppExit Default Restart | Out-Null
    & $nssm set $name AppRestartDelay 5000 | Out-Null
    & $nssm set $name AppStdout $stdout | Out-Null
    & $nssm set $name AppStderr $stderr | Out-Null
    & $nssm set $name AppRotateFiles 1 | Out-Null
    & $nssm set $name AppRotateOnline 1 | Out-Null
    & $nssm set $name AppRotateBytes 5242880 | Out-Null
}

Write-Step "Services NSSM $daemonSvc et $freshSvc"
Set-NssmService $daemonSvc (Join-Path $InstallDir 'clamd.exe') "--config-file=`"$clamdConf`"" 'ClamAV - demon antivirus' "clamd 127.0.0.1:$Port - analyse des televersements (INSTREAM)." (Join-Path $logs 'nssm-clamd-stdout.log') (Join-Path $logs 'nssm-clamd-stderr.log')
Set-NssmService $freshSvc (Join-Path $InstallDir 'freshclam.exe') "--config-file=`"$freshConf`" --daemon --foreground" 'ClamAV - mise a jour des signatures' 'freshclam en mode demon (12 controles par jour).' (Join-Path $logs 'nssm-freshclam-stdout.log') (Join-Path $logs 'nssm-freshclam-stderr.log')
& $nssm set $freshSvc DependOnService $daemonSvc | Out-Null

Write-Step 'Demarrage du demon (chargement des signatures : 30 a 120 s)'
Start-Service -Name $daemonSvc
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', $Port)
        $stream = $client.GetStream()
        $stream.ReadTimeout = 5000
        $bytes = [Text.Encoding]::ASCII.GetBytes("zPING$([char]0)")
        $stream.Write($bytes, 0, $bytes.Length)
        $buf = New-Object byte[] 16
        $n = $stream.Read($buf, 0, 16)
        $client.Close()
        if ([Text.Encoding]::ASCII.GetString($buf, 0, $n).Trim([char]0, "`n") -eq 'PONG') { $ok = $true; break }
    } catch { }
}
if (-not $ok) { throw "clamd ne repond pas au PING (voir $logs\clamd.log)" }
Write-Step 'clamd repond : PONG'

Start-Service -Name $freshSvc
Start-Sleep -Seconds 3
Write-Step ("{0} : {1}" -f $freshSvc, (Get-Service -Name $freshSvc).Status)
$bound = Get-NetTCPConnection -State Listen -LocalPort $Port | Select-Object -ExpandProperty LocalAddress -Unique
Write-Step ("OK - ecoute sur : {0}" -f ($bound -join ', '))
