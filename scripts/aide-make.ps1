# Affiche les cibles documentées du Makefile (« cible: ## description »).
Select-String -Path (Join-Path $PSScriptRoot "..\Makefile") -Pattern '^([a-z-]+):.*## (.*)$' | ForEach-Object {
    "{0,-20} {1}" -f $_.Matches[0].Groups[1].Value, $_.Matches[0].Groups[2].Value
}
