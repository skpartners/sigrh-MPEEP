"""Normalise les noms des structures et les rattachements des agents (voir `personnel/normalisation.py`).

Sans option, la commande ne modifie rien : elle écrit le rapport. Avec `--appliquer`, les structures sont
renommées en place (par identifiant, jamais supprimées ni recréées) et les libellés de rattachement des agents
sont alignés. Deux structures qui portent le même nom après normalisation ne sont pas fusionnées : elles sont
signalées pour décision de la DRH. Rejouée, la commande ne change plus rien.
"""

import csv
from collections import defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from personnel.models import Agent, EntiteTutelle
from personnel.normalisation import nom_structure
from personnel.rattachement import normaliser

CHAMPS_AGENT = ("structure", "direction", "sous_direction", "service")
ENTETES = ["id", "code", "niveau", "parent", "nom_avant", "nom_apres", "a_valider"]


class Command(BaseCommand):
    help = "Normalise les noms de structures et les rattachements des agents (aperçu par défaut)."

    def add_arguments(self, parser):
        parser.add_argument("--appliquer", action="store_true", help="Écrit les changements en base.")
        parser.add_argument("--rapport", default="rapports_normalisation/structures.csv", help="Fichier CSV des correspondances.")

    def handle(self, *args, appliquer=False, rapport, **options):
        entites = list(EntiteTutelle.objects.select_related("parent").order_by("niveau", "nom"))
        apres = {e.pk: nom_structure(e.nom) for e in entites}

        doublons = defaultdict(list)
        for e in entites:
            if e.niveau != "ministere":
                doublons[(e.parent_id, normaliser(apres[e.pk]))].append(e.pk)
        en_double = {pk for pks in doublons.values() if len(pks) > 1 for pk in pks}

        lignes, changes = [], []
        for e in entites:
            remarques = []
            if e.pk in en_double:
                remarques.append("même nom que d'autres structures du même parent : fusion à décider")
            if normaliser(apres[e.pk]) in {"null", ""}:
                remarques.append("libellé sans signification")
            if apres[e.pk] != e.nom:
                changes.append(e)
            if apres[e.pk] != e.nom or remarques:
                lignes.append([e.pk, e.code, e.niveau, e.parent.nom if e.parent_id else "", e.nom, apres[e.pk], " ; ".join(remarques)])

        chemin = Path(rapport)
        chemin.parent.mkdir(parents=True, exist_ok=True)
        with chemin.open("w", encoding="utf-8-sig", newline="") as fichier:
            ecrivain = csv.writer(fichier, delimiter=";")
            ecrivain.writerow(ENTETES)
            ecrivain.writerows(lignes)

        agents_modifies = 0
        with transaction.atomic():
            for champ in CHAMPS_AGENT:
                for valeur in Agent.objects.exclude(**{champ: ""}).values_list(champ, flat=True).distinct():
                    nouveau = nom_structure(valeur)
                    if nouveau != valeur:
                        agents_modifies += 1
                        if appliquer:
                            Agent.objects.filter(**{champ: valeur}).update(**{champ: nouveau})
            if appliquer:
                for e in changes:
                    EntiteTutelle.objects.filter(pk=e.pk).update(nom=apres[e.pk])

        verbe = "renommée(s)" if appliquer else "à renommer (aperçu, rien écrit)"
        self.stdout.write(f"{len(changes)} structure(s) {verbe}, {len(en_double)} en double à décider, libellés de rattachement d'agents concernés : {agents_modifies}. Rapport : {chemin}")
