"""Normalise les noms et prénoms des agents (voir `personnel/normalisation.py`).

Sans option, la commande ne modifie rien : elle écrit le rapport. Avec `--appliquer`, elle met à jour
les agents en place (par identifiant, sans toucher aux matricules, comptes ni mots de passe).
Rejouée, elle ne change plus rien.
"""

import csv
from pathlib import Path

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from personnel.models import Agent
from personnel.normalisation import normaliser_identite

ENTETES = ["matricule", "nom_avant", "prenoms_avant", "nom_jeune_fille_avant", "nom_apres", "prenoms_apres", "nom_jeune_fille_apres", "a_valider"]


class Command(BaseCommand):
    help = "Normalise les noms, prénoms et noms de naissance des agents (aperçu par défaut)."

    def add_arguments(self, parser):
        parser.add_argument("--appliquer", action="store_true", help="Écrit les changements en base.")
        parser.add_argument("--rapport", default="rapports_normalisation/identites.csv", help="Fichier CSV des correspondances (données personnelles : hors dépôt).")

    def handle(self, *args, appliquer=False, rapport, **options):
        lignes, changes, douteux = [], [], 0
        for agent in Agent.objects.order_by("matricule"):
            avant = (agent.nom, agent.prenoms, agent.nom_jeune_fille)
            identite = normaliser_identite(*avant)
            apres = (identite.nom, identite.prenoms, identite.nom_jeune_fille)
            if apres == avant and not identite.douteux:
                continue
            lignes.append([agent.matricule, *avant, *apres, " ; ".join(identite.douteux)])
            douteux += bool(identite.douteux)
            if apres != avant:
                changes.append((agent, identite))

        chemin = Path(rapport)
        chemin.parent.mkdir(parents=True, exist_ok=True)
        with chemin.open("w", encoding="utf-8-sig", newline="") as fichier:
            ecrivain = csv.writer(fichier, delimiter=";")
            ecrivain.writerow(ENTETES)
            ecrivain.writerows(lignes)

        if appliquer:
            with transaction.atomic():
                for agent, identite in changes:
                    Agent.objects.filter(pk=agent.pk).update(nom=identite.nom, prenoms=identite.prenoms, nom_jeune_fille=identite.nom_jeune_fille)
                    User.objects.filter(username__iexact=agent.matricule).update(last_name=identite.nom[:150], first_name=identite.prenoms[:150])

        self.stdout.write(f"{len(changes)} agent(s) {'modifié(s)' if appliquer else 'à modifier (aperçu, rien écrit)'}, {douteux} cas à valider. Rapport : {chemin}")
