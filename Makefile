# SIGRH : raccourcis de développement et d'exploitation (Windows).
# Usage (racine du dépôt) :  make aide
# Les cibles `service-*` pilotent le service Windows NSSM « SIGRH » : console administrateur requise.

POWERSHELL := powershell -NoProfile -ExecutionPolicy Bypass
NSSM       := C:/nssm/nssm.exe
SERVICE    := SIGRH
JOURNAL    := api/logs/sigrh-service.log

.DEFAULT_GOAL := aide
.PHONY: aide dev api front installer build migrer migrations tests verifier \
        service-installer service-demarrer service-arreter service-redemarrer service-etat service-journal deploiement

aide: ## Liste les cibles
	@$(POWERSHELL) -File scripts/aide-make.ps1

# --- Développement -----------------------------------------------------------------------------------
dev: ## API (8101) et front (9100) dans ce terminal
	@$(POWERSHELL) -File start-dev.ps1

api: ## API seule, http://127.0.0.1:8101
	uv --directory api run python manage.py runserver 127.0.0.1:8101

front: ## Front seul (Vite), http://127.0.0.1:9100/sigrh/
	npm --prefix client run dev

celery-worker: ## Worker Celery (tâches planifiées), Redis requis
	uv --directory api run celery -A config worker -l info --pool=threads --concurrency=4

celery-beat: ## Planificateur Celery beat
	uv --directory api run celery -A config beat -l info

installer: ## Installe les dépendances de l'API et du front
	uv --directory api sync
	npm --prefix client install

# --- Base de données ---------------------------------------------------------------------------------
migrer: ## Applique les migrations
	uv --directory api run python manage.py migrate

migrations: ## Crée les migrations manquantes
	uv --directory api run python manage.py makemigrations

# --- Qualité -----------------------------------------------------------------------------------------
tests: ## Tests de l'API
	uv --directory api run python -m pytest personnel/tests -q

verifier: ## Vérifie Django et compile le front (sans produire dist)
	uv --directory api run python manage.py check
	npm --prefix client exec -- tsc --noEmit -p client

# --- Production : service Windows NSSM -------------------------------------------------------------
build: ## Construit client/dist (servi par le service)
	npm --prefix client run build

service-installer: ## (Ré)installe le service NSSM (reconstruit le front)
	@$(POWERSHELL) -File api/deploiement/install-service-sigrh.ps1

service-demarrer: ## Démarre le service
	$(NSSM) start $(SERVICE)

service-arreter: ## Arrête le service
	$(NSSM) stop $(SERVICE)

service-redemarrer: ## Redémarre le service (après un changement Python ou un build)
	$(NSSM) restart $(SERVICE)

service-etat: ## État du service
	@$(POWERSHELL) -Command "Get-Service $(SERVICE) | Format-Table Name, Status, StartType -AutoSize"

service-journal: ## Suit le journal du service (Ctrl+C pour quitter)
	@$(POWERSHELL) -Command "Get-Content -Path '$(JOURNAL)' -Tail 50 -Wait"

celery-installer: ## (Ré)installe les services SIGRH-Celery et SIGRH-Celery-Beat
	@$(POWERSHELL) -File api/deploiement/install-services-celery-sigrh.ps1

celery-redemarrer: ## Redémarre le worker et beat (après un changement Python)
	$(NSSM) restart SIGRH-Celery
	$(NSSM) restart SIGRH-Celery-Beat

deploiement: build migrer service-redemarrer celery-redemarrer ## Build du front, migrations, puis redémarrage du service et de Celery
