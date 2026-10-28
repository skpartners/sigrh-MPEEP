# Vérifie la chaîne antivirus de SIGRH : service ClamAV-Daemon, réponse du démon, détection du fichier de test EICAR
# (protocole INSTREAM, le même que celui de l'application), signatures à jour, dépendance du service SIGRH.
# Aucune écriture : sûr à lancer à tout moment, sans droits administrateur.

param(
    [string]$Hote = "127.0.0.1",
    [int]$Port = 3310
)

$ErrorActionPreference = "Stop"
$echecs = 0

function Resultat([bool]$ok, [string]$texte) {
    if ($ok) { Write-Host "[ OK ] $texte" -ForegroundColor Green }
    else { Write-Host "[FAIL] $texte" -ForegroundColor Red; $script:echecs++ }
}

function Envoyer-Instream([byte[]]$contenu) {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect($Hote, $Port)
    try {
        $flux = $client.GetStream()
        $flux.ReadTimeout = 15000
        $entete = [Text.Encoding]::ASCII.GetBytes("zINSTREAM$([char]0)")
        $flux.Write($entete, 0, $entete.Length)
        $taille = [BitConverter]::GetBytes([uint32]$contenu.Length)
        [Array]::Reverse($taille)   # longueur en gros-boutiste
        $flux.Write($taille, 0, 4)
        $flux.Write($contenu, 0, $contenu.Length)
        $flux.Write([byte[]](0, 0, 0, 0), 0, 4)
        $tampon = New-Object byte[] 512
        $n = $flux.Read($tampon, 0, 512)
        return [Text.Encoding]::ASCII.GetString($tampon, 0, $n).Trim([char]0, "`n", " ")
    }
    finally { $client.Close() }
}

$demon = Get-Service -Name ClamAV-Daemon -ErrorAction SilentlyContinue
Resultat ($null -ne $demon -and $demon.Status -eq "Running") ("Service ClamAV-Daemon : " + $(if ($demon) { $demon.Status } else { "absent" }))
$maj = Get-Service -Name ClamAV-Freshclam -ErrorAction SilentlyContinue
Resultat ($null -ne $maj -and $maj.Status -eq "Running") ("Service ClamAV-Freshclam (mise à jour des signatures) : " + $(if ($maj) { $maj.Status } else { "absent" }))

try {
    $sain = Envoyer-Instream ([Text.Encoding]::ASCII.GetBytes("fichier de test sans danger"))
    Resultat ($sain -like "*OK") "Fichier sain accepté : $sain"
    $eicar = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
    $menace = Envoyer-Instream ([Text.Encoding]::ASCII.GetBytes($eicar))
    Resultat ($menace -like "*FOUND") "Fichier EICAR détecté : $menace"
}
catch {
    Resultat $false "clamd ne répond pas sur ${Hote}:$Port ($($_.Exception.Message))"
}

$signatures = Get-ChildItem "C:\ClamAV\db" -Include "*.cvd", "*.cld" -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($signatures) {
    $age = (Get-Date) - $signatures.LastWriteTime
    Resultat ($age.TotalDays -lt 3) ("Signatures : dernière mise à jour il y a {0:N0} h ({1})" -f $age.TotalHours, $signatures.Name)
}
else { Resultat $false "Aucune base de signatures dans C:\ClamAV\db" }

$sigrh = Get-Service -Name SIGRH -ErrorAction SilentlyContinue
if ($sigrh) {
    $depend = @($sigrh.ServicesDependedOn | ForEach-Object Name)
    Resultat ($depend -contains "ClamAV-Daemon") ("SIGRH attend ClamAV-Daemon : " + $(if ($depend.Count) { $depend -join ", " } else { "aucune dépendance" }))
}

if ($echecs) { Write-Host "`n$echecs contrôle(s) en échec." -ForegroundColor Red; exit 1 }
Write-Host "`nL'antivirus est opérationnel." -ForegroundColor Green
