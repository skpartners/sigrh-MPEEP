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
