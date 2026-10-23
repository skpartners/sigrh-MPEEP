# SIGRH — Portefeuille de l'État

Système intégré de gestion des ressources humaines du Ministère du Portefeuille de l'État et des Entreprises Publiques.

Le **front** et l'**API** sont deux serveurs. Le navigateur charge React sur une origine, et React appelle Django sur une autre. Il n'y a pas de proxy : l'adresse de l'API est `VITE_API_BASE_URL`.

La base est un fichier **SQLite** : `api/db.sqlite3` (moteur `django.db.backends.sqlite3`). `migrate` crée le fichier, `seed_demo` y charge le jeu de démonstration.

| Serveur | Dossier | Adresse locale |
|---|---|---|
| API Django | `api/` | http://127.0.0.1:8101 |
| Front React (Vite) | `client/` | http://127.0.0.1:9100 |

Les maquettes d'origine sont dans `Templates/`. L'interface servie est entièrement React, dans `client/src/screens/` (accueil, connexion, tableau de bord, dossier, carrières, circuits, action sociale, formation).

## Démarrage local

Les deux serveurs dans un seul terminal (racine du dépôt) :

```powershell
.\start-dev.ps1
```

Le script libère les ports 8101 et 9100, réinstalle les paquets du front, puis démarre l’API et Vite. Ctrl+C arrête les deux. Le build `client/dist` n’est pas produit ici : il sert au service Windows (`api/deploiement/install-service-sigrh.ps1`).

### Tâches de fond, mise à jour et charge

**Redis et Celery.** Les rappels d'échéances de la campagne de congés, la veille des retours et le nettoyage des fichiers tournent avec Celery, sur le Redis du poste (bases 2 à 4, hors de celles des autres projets). `CELERY_BROKER_URL`, `CHANNEL_LAYERS_REDIS_URL` et `CACHE_REDIS_URL` se règlent dans `api/.env`. Sans `CELERY_BROKER_URL`, le serveur garde sa boucle interne et les traitements longs se font dans la requête.

- Production : `make celery-installer` installe les services Windows `SIGRH-Celery` (worker, 4 fils) et `SIGRH-Celery-Beat` (planificateur), console administrateur ; `make deploiement` les redémarre avec le service.
- Développement : `make celery-worker` et `make celery-beat`.

**Traitements longs.** Les imports et les exports lourds (PDF, classeurs, archives) sont confiés à un worker quand il en répond un : la vue répond 202, le front attend la fin tout seul et affiche l'avancement dans l'indicateur de l'en-tête, visible seulement de celui qui l'a lancé. Pour confier une vue à Celery, la décorer avec `@en_arriere_plan("Libellé")` (`api/personnel/taches.py`) ; elle peut annoncer son avancement avec `progresser(pourcentage, message)`. Les résultats se gardent 24 h.

**Nouvelle version.** Le front compare le build qu'il a chargé à celui que le serveur publie (au retour sur l'onglet, au retour du réseau, après une coupure du temps réel et toutes les cinq minutes) et propose d'actualiser, sans rien interrompre.

**Messagerie.** Photos, documents, notes vocales et vidéos se joignent aux messages (15 Mo et 5 fichiers au plus). Pour ne pas saturer le disque, **le fichier n'est gardé que 48 h** : une tâche planifiée (toutes les 30 minutes) le supprime, le message indique que le média a expiré, et le texte reste.

**Charge.** Le service `SIGRH` tourne sous uvicorn avec 6 processus (variable `$processus` de `install-service-sigrh.ps1`), chaque requête s'exécutant dans son propre fil. Le temps réel, le cache et les tâches passent par Redis pour que les processus restent d'accord. Le front compilé est servi par WhiteNoise, compressé (brotli) et mis en cache un an. La base est **PostgreSQL** (rôle et base `sigrh`, réglés par `SIGRH_DB_*` dans `api/.env`) ; chaque processus garde au plus `SIGRH_DB_POOL_MAX` connexions (8 par défaut), car le serveur PostgreSQL est partagé avec d'autres projets. Sans `SIGRH_DB_ENGINE`, SQLite en mode WAL reste utilisable (développement).

**Passer à PostgreSQL.**

1. Créer la base et son rôle : `CREATE ROLE sigrh LOGIN PASSWORD '…'; CREATE DATABASE sigrh OWNER sigrh ENCODING 'UTF8';`
2. Sauvegarder `api/db.sqlite3` (avec ses fichiers `-wal` et `-shm`), puis exporter les données : `uv run python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.permission -e sessions --indent 1 -o donnees.json`
3. Dans `api/.env` : `SIGRH_DB_ENGINE=postgres`, `SIGRH_DB_NAME`, `SIGRH_DB_USER`, `SIGRH_DB_PASSWORD`, `SIGRH_DB_HOST`, `SIGRH_DB_PORT`.
4. `uv run python manage.py migrate`, puis `uv run python manage.py loaddata donnees.json`.
5. Redémarrer `SIGRH`, `SIGRH-Celery` et `SIGRH-Celery-Beat`.

Premier lancement (dépendances et base), une fois :

```powershell
cd api
uv sync
uv run python manage.py migrate
uv run python manage.py seed_demo
cd ..\client
npm install
cd ..
.\start-dev.ps1
```

Pour lancer chaque serveur à part :

```powershell
cd api
uv run python manage.py runserver 127.0.0.1:8101
```

```powershell
cd client
npm run dev
```

Ouvrir http://127.0.0.1:9100.

Compte de démonstration (à changer hors du poste de développement) :

- matricule `DRH-2018-044`
- mot de passe `Sigrh-Dev-2026`
- entité `Direction Générale du Portefeuille de l'État`

## Deux serveurs en déploiement

- Le front est un build statique : `npm run build` dans `client/`, servi par nginx (ou équivalent). Avant le build, `VITE_API_BASE_URL` doit pointer vers l'origine publique de l'API.
- L'API n'accepte que les origines listées dans `SIGRH_SPA_ORIGINS` (voir `api/.env.example`).
- L'authentification est un jeton `Authorization: Token …`, pas un cookie de session. Le front et l'API peuvent donc vivre sur des hôtes différents.

## Temps réel (WebSocket)

L'API sert aussi un WebSocket sur `ws://127.0.0.1:8101/ws/` (Django Channels ; `daphne` rend `runserver` compatible, la commande de démarrage ne change pas). Il pousse les nouveaux messages de la messagerie, les lectures et les notifications ; sans lui, le front se rafraîchit périodiquement.

- Le client envoie son jeton dans le premier message (`{"type": "auth", "token": "…"}`), jamais dans l'URL. Sans authentification valide sous 10 s, la connexion est fermée.
- Seules les origines de `SIGRH_SPA_ORIGINS` peuvent ouvrir le WebSocket.
- En développement, la couche de messages est en mémoire (un seul processus). En production avec plusieurs processus, installer `channels-redis` et définir `CHANNEL_LAYERS_REDIS_URL` (par exemple `redis://127.0.0.1:6379/0`). Le proxy (nginx) doit relayer `/ws/` en WebSocket (`Upgrade`/`Connection`).

Comptes de démonstration pour la messagerie : les agents de la DGPE (`394812H`, `476112P`, `349812K`, `318490K`, `289043B`, `340188P`) se connectent avec le même mot de passe que le DRH.
