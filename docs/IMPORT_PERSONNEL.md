# Import du fichier du personnel

Ce document décrit comment le fichier **`Base_personnel_MPEEP.xlsx`** (la base du personnel du ministère) a été chargé dans SIGRH, pour qu'un autre développeur obtienne **exactement le même résultat**. La dernière partie lui confie un travail de **normalisation** des données.

- Les scripts sont dans `scripts/import_personnel/`.
- L'importeur du système est `api/personnel/import_effectif.py` (agents et comptes) et `api/personnel/import_structures.py` (pôles, structures, grades, emplois).
- Le classeur contient des données personnelles : **il ne doit jamais être commité**. Il se transmet hors du dépôt.

## 1. Ce que fait l'import

Le fichier source n'a pas le format du modèle d'import du système (une seule feuille, un seul champ « nom et prénoms », la hiérarchie sur quatre colonnes). Le script `convertir_base_personnel.py` le **convertit** en deux classeurs au format du système, puis les charge :

1. **Structures** (`import_structures`) : crée les pôles, les directions, sous-directions et services absents.
2. **Agents** (`import_effectif`) : crée ou met à jour chaque agent par son matricule, son rattachement et son **compte de connexion**.
3. **Compléments** que le classeur d'import ne porte pas : date de prise de service dans l'emploi actuel, diplômes, emploi absent du référentiel.

Le chargement « réel » **remplace les données de démonstration** une seule fois et fixe le drapeau `ParametresMinistere.donnees_reelles` : ensuite, plus rien d'inventé n'est créé, et la commande `seed_demo` refuse de s'exécuter (sauf `--forcer`, en développement seulement).

## 2. Le fichier source

Feuille **`base`** (la première ligne contient les en-têtes) ; les feuilles `emplois`, `Categorie` et `Grade` du fichier ne sont pas lues. Une ligne sans matricule est ignorée.

| Col. | En-tête du fichier | Devient (champ de l'agent) | Traitement |
|---|---|---|---|
| A | MLE | `matricule` | Identifiant et nom d'utilisateur. Doublon (même matricule, sans tenir compte de la casse) : on garde la ligne dont le nom est le plus complet. |
| B | NOM ET PRENOMS | `nom`, `prenoms` | Un seul champ à séparer (voir § 3). |
| C | GENRE | `sexe` | `F` → F, tout le reste → H. |
| D | EMPLOI | `emploi` | Doit exister dans le référentiel des emplois, sinon l'emploi est conservé dans `corps` (voir § 3). |
| E | FAMILLE_EMPLOIS | famille de l'emploi créé | Table de correspondance du script (`FAMILLE`). |
| F | TYPE DE FONCTIONNAIRE | `corps` | « NC » ignoré. |
| G | GRADE | `grade` | Retenu seulement s'il existe dans le référentiel (« NON DEFINI » → vide). |
| H | CATEGORIE | — | Non lue : la catégorie se déduit du grade. |
| I | FONCTION | `fonction` | Recopié. |
| J | PROGRAMME | — | Non lue. |
| K | STRUCTURES | racine de la hiérarchie | Voir § 3. |
| L | DIRECTION CENTRALE | niveau 1 | idem |
| M | SOUS DIRECTION | niveau 2 | idem |
| N | SERVICE | niveau 3 | idem |
| O | SITUATION GEOGRAPHIQUE | — | Non lue. |
| P | STATUT | `type_agent` | Commence par « CONTRAC » → Contractuel, sinon Fonctionnaire. |
| Q | TYPE DE CONTRAT | `mode_recrutement` | Utilisé si la colonne Y est vide. |
| R | DIPLOME OU NIVEAU | `Diplome.libelle` + niveau | Niveau déduit par mot-clé (doctorat, bac+5… cepe). |
| S | SPECIALITE | `domaine_formation` | Recopié. |
| T | DATE D'ENTREE AU MPPEEP | `prise_service_ministere` | Date série Excel. |
| U | DATE DE PS EMPLOIS ACTUEL | `prise_service_emploi` | Date série Excel, ajoutée après l'import. |
| V | DATE D'ENTREE … CONTRACTUEL | — | Non lue. |
| W | DATE DE NAISSANCE | `date_naissance` | Date série Excel (jours depuis le 30/12/1899). |
| X | LIEU DE NAISSANCE | `lieu_naissance` | Recopié. |
| Y | MODE D'INTEGRATION | `mode_recrutement` | Prioritaire sur Q. |
| Z | SANCTION DISCIPLINAIRE | — | Non lue. |

Absents du fichier, donc vides à l'import : téléphone, courriel, situation matrimoniale, échelon, supérieur hiérarchique. Le **rôle** de chaque agent est « Agent » : les chefs, sous-directeurs et directeurs se désignent ensuite dans l'écran *Utilisateurs* (sans cela, les circuits de validation n'ont aucun approbateur).

## 3. Règles de transformation

### Noms et prénoms
Le champ `NOM ET PRENOMS` est séparé par une heuristique (fonction `scinder`) :
- espaces multiples réduits à un seul ;
- si le mot « NEE » apparaît (hors premier et dernier mot), le nom va jusqu'au mot qui suit « NEE » ;
- sinon, **le nom est le premier mot** et le reste devient les prénoms, mis en casse de titre (`str.title()`).

C'est la règle la plus fragile de l'import : voir § 6.

### Hiérarchie des structures
- La colonne K désigne la racine ; `DGPE`, `CABINET` et `DGEPN` sont ramenés par la table `ALIAS` aux structures existantes (« Direction Générale du Portefeuille de l'État », « Cabinet », « DGPN »). Le pôle suit : DGPE, Cabinet, DGPN, sinon « Administration générale ».
- Les colonnes L, M, N descendent d'un niveau chacune. Une colonne vide, ou de même nom que son parent, est sautée.
- Les niveaux respectent les règles du système : direction centrale → sous-direction → service. **Rien ne se rattache à un service** : l'agent reste alors dans ce service.
- L'agent est rattaché à la structure la plus basse trouvée.
- La comparaison des noms ignore la casse, les accents, les tirets et les espaces multiples (`_norm` dans `import_agents.py`) : « Service des moyens généraux » et « SERVICE DES MOYENS GENERAUX » sont la même structure.

### Emplois
Un emploi n'a qu'une graphie : la première rencontrée dans le fichier fait foi pour les variantes. Un emploi inconnu du référentiel est créé s'il a une famille et un grade connus ; sinon l'agent n'a pas d'emploi et le libellé est porté par son champ `corps`.

### Diplômes
Une ligne par agent dont la colonne R est renseignée et reconnue : un `Diplome` est créé, et le diplôme de plus haut niveau est aussi recopié sur la fiche de l'agent.

### Comptes de connexion
Un compte par agent : identifiant = matricule, **mot de passe initial = `matricule@2026`**, notification « Bienvenue : changez votre mot de passe ». Le compte d'administration technique (`491160T` par défaut, variable `SIGRH_ADMIN`) est conservé.

## 4. Méthode pas à pas

Prérequis : dépendances installées (`uv sync` dans `api/`), `migrate` exécuté, un compte d'administration technique existant.

```powershell
cd api

# 0. Sauvegarde de la base (obligatoire : le chargement réel purge les données de démonstration)
Copy-Item db.sqlite3 db.sqlite3.avant-base-reelle.bak

# 1. Indiquer le classeur (jamais dans le dépôt)
$env:BASE_PERSONNEL = "C:\chemin\vers\Base_personnel_MPEEP.xlsx"

# 2. Aperçu : lit le fichier, affiche le bilan, ne touche pas à la base
uv run python manage.py shell -c "MODE='apercu'; exec(open('../scripts/import_personnel/convertir_base_personnel.py', encoding='utf-8').read())"

# 3. Essai : charge pour de vrai dans une transaction, puis annule tout (compter plusieurs minutes : 399 mots de passe à calculer)
uv run python manage.py shell -c "MODE='essai'; exec(open('../scripts/import_personnel/convertir_base_personnel.py', encoding='utf-8').read())"

# 4. Chargement réel
uv run python manage.py shell -c "MODE='reel'; exec(open('../scripts/import_personnel/convertir_base_personnel.py', encoding='utf-8').read())"
```

Bilan attendu de l'aperçu sur le fichier d'origine : **400 lignes lues, 399 agents à charger, 1 doublon fusionné** (matricule `2207F`). Le chargement réel crée les structures et les emplois absents, les 399 agents, 55 diplômes et les comptes de connexion.

Si l'essai échoue, le script affiche la cause et les lignes en erreur du classeur ; rien n'est enregistré. L'import est **atomique** : il réussit en entier ou pas du tout.

> Sur une base déjà chargée, l'aperçu et l'essai fonctionnent (les structures existent, le script n'en recrée pas). Ne rejouez **pas** le mode `reel` sur une base en production : il purge d'abord les données de démonstration et les données saisies depuis.

### Vérification après chargement

```powershell
uv run python manage.py shell -c "
from personnel.models import Agent, Diplome, EntiteTutelle, ParametresMinistere
from django.contrib.auth.models import User
print('agents', Agent.objects.count(), '| comptes', User.objects.count(), '| diplômes', Diplome.objects.count(), '| structures', EntiteTutelle.objects.count())
print('données réelles :', ParametresMinistere.objects.get(pk=1).donnees_reelles)
print('sans grade :', Agent.objects.filter(grade='').count(), '| sans date de naissance :', Agent.objects.filter(date_naissance=None).count())
"
uv run python -m pytest personnel/tests -q
```

## 5. Ce que l'import a produit (état de référence)

| Mesure | Valeur |
|---|---|
| Agents chargés | 399 (dont 54 contractuels) |
| Doublon de matricule fusionné | 1 (`2207F`) |
| Structures (tous niveaux, hors ministère) | 165 |
| Diplômes | 55 |
| Agents sans date de naissance | 19 |
| Agents sans grade (« NON DEFINI » dans le fichier) | 54 |
| Agents sans emploi du référentiel | 54 |

## 6. À faire : normaliser les données

Le fichier est saisi en majuscules, sans accents, avec des espaces parasites et des graphies qui varient pour une même valeur. L'import les recopie telles quelles. **Il faut maintenant les normaliser**, sans casser les rattachements ni les comptes.

### 6.1 Noms et prénoms (priorité 1)
Constats mesurés sur la base chargée :
- **98 agents** ont un nom d'un seul mot et trois prénoms ou plus (ex. `ADJE` / `Aka Tanoh Orphelia Carmel Olinda`) : le nom de famille est très probablement **composé** et a été tronqué à son premier mot. Aucune règle ne peut le deviner à coup sûr ; il faut une règle documentée et une liste de contrôle.
- **41 noms** contiennent « NEE » (nom de naissance) : `ACHIEPO NEE GUEDE`. Le système a un champ **`nom_jeune_fille`** : le nom d'épouse et le nom de naissance doivent y être séparés proprement.
- **4 prénoms** contiennent « Epse » ou « Epouse » (ex. `Miyala Annick Epse Bassole`) : le nom d'épouse est tombé dans les prénoms.
- 7 noms avec espaces multiples ou en bordure ; 1 nom en casse mixte.
- Les prénoms sont en casse de titre, mais pas toujours correcte (`N'Guessan`, `Pierre-Marie`, `M'Pa`) ; les accents sont absents (le fichier n'en a pas) : **13 prénoms seulement en portent**.

À produire : convention écrite (nom en MAJUSCULES, prénoms en casse de titre, apostrophes et traits d'union gérés, accents rétablis quand ils sont connus, normalisation Unicode NFC), séparation fiable nom / nom de naissance / nom d'épouse / prénoms, et rapport des cas douteux à valider par la DRH.

### 6.2 Structures
- 165 structures : **114 en MAJUSCULES, 51 en casse normale** — il en faut une seule convention (casse de titre avec accents, sigles en majuscules).
- Variantes d'une même structure dans le fichier : `DIRECTION DES AFFAIRES JURIDIQUES` / `Direction des Affaires Juridiques`, `MOYENS GENERAUX` / `MOYENS GÉNÉRAUX`, espaces en fin de libellé (12 lignes de sous-direction et 8 lignes de service du fichier).
- Graphies incohérentes : `SOUS DIRECTION` / `SOUS-DIRECTION`, virgule précédée d'un espace (`TECHNOLOGIE ,TELECOMMUNICATION`), accents manquants (`RATTACHE À LA DIRECTION GENERALE`).
- **Attention** : une structure se retrouve par sa forme normalisée (`_norm`). On peut donc changer l'affichage librement, mais **renommer en place** (par identifiant), jamais supprimer / recréer, sinon les agents et les droits perdent leur rattachement.

### 6.3 Emplois, fonctions et autres libellés
- **Emplois** : 82 graphies pour 78 emplois (`… option CHAUFFEUR` / `… OPTION CHAUFFEUR`, espace final). Le référentiel officiel compte 608 emplois de la Fonction publique ; 4 emplois du fichier n'y figurent pas et restent dans `corps`.
- **Fonctions** : 129 valeurs, 2 variantes, 7 avec espaces parasites ; à harmoniser (`Chef de service`, `CHEF DE SERVICE`…).
- **Spécialités** (50 valeurs → 46 après normalisation), **diplômes** (14), **lieux de naissance** (14, 386 vides), **modes d'intégration** (10, 331 vides), **types de contrat** (4), **types de fonctionnaire / corps** (4 valeurs, dont 201 lignes avec espace en fin de libellé).
- **Grades** : 55 agents « NON DEFINI » à compléter par la DRH ; le grade conditionne la limite d'âge de départ à la retraite (65 ans pour certains grades, 60 sinon) — un agent est déjà au-delà de 60 ans sans grade.

### 6.4 Dates, matricules et valeurs manquantes
- Dates : le fichier utilise des numéros de série Excel ; vérifier les dates aberrantes. **19 dates de naissance manquent**.
- Matricules : 1 doublon fusionné (`2207F`, deux graphies du nom). Vérifier que les homonymes ne sont pas de vrais doublons.
- Téléphone, courriel et situation matrimoniale sont **absents** : à collecter (le profil de l'agent les contrôle déjà : numéro ivoirien, adresse valide).

### 6.5 Livrable attendu
1. Un module `api/personnel/normalisation.py` avec des fonctions pures et testées (une par type de donnée), appelées par `convertir_base_personnel.py` **avant** le chargement.
2. Un **fichier de correspondances** (CSV) listant `valeur d'origine → valeur normalisée` par catégorie, relisible par la DRH.
3. Une **migration de données** (ou commande) qui applique la normalisation à la base existante, **idempotente** : la rejouer ne change plus rien, ne duplique aucune structure et ne touche ni aux matricules ni aux mots de passe.
4. Un rapport avant / après (comptes de valeurs distinctes par colonne, cas à valider).
5. Des tests dans `api/personnel/tests/` (le jeu de tests actuel : `python -m pytest personnel/tests -q`, 185 tests au vert).
6. Une **sauvegarde** de la base avant toute exécution sur les données réelles.

### 6.6 Points d'attention
- Ne jamais rejouer l'import `reel` pour « corriger » : il purge. Pour corriger, mettre à jour en place.
- Garder `_norm` comme clé de rapprochement, sans la modifier : l'importeur, les rattachements et les droits en dépendent.
- Aucune donnée personnelle (le classeur, les sauvegardes `.bak`, les extractions de la base) dans le dépôt.
