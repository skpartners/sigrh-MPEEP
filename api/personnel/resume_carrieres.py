"""Chiffres de l'écran d'accueil des carrières : tous lus dans les registres, aucun chiffre figé."""

from datetime import date

from .fin_carriere import _age, assurer_admissions
from .models import Agent, Demande, DossierRetraite, LigneAvancement, Mutation, PosteSensible
from .visibilite import agents_visibles

TRANCHES = (
    ("60 ans et +", 60, 200),
    ("50-59 ans", 50, 59),
    ("40-49 ans", 40, 49),
    ("30-39 ans", 30, 39),
    ("Moins de 30 ans", 0, 29),
)


def _part(partie: int, total: int) -> int:
    return round(100 * partie / total) if total else 0


def resume(user, aujourd_hui: date) -> dict:
    assurer_admissions(aujourd_hui)
    agents = list(agents_visibles(Agent.objects.all(), user))

    lignes = agents_visibles(LigneAvancement.objects.all(), user, "agent__matricule")
    nb_lignes = lignes.count()
    avec_avis = lignes.exclude(avis="").count()

    mutations = agents_visibles(Mutation.objects.all(), user, "agent__matricule")
    nb_mutations = mutations.count()
    mutations_ouvertes = mutations.filter(statut=Mutation.Statut.EN_COURS).count()

    conges = agents_visibles(Demande.objects.filter(categorie="conge"), user, "agent__matricule")
    nb_conges = conges.count()
    conges_clos = conges.filter(etape__istartswith="Clôturée").count() + conges.filter(etape__icontains="refus").count()

    dossiers = list(agents_visibles(DossierRetraite.objects.select_related("agent"), user, "agent__matricule"))
    cadres = sum(1 for item in dossiers if (item.agent.grade or "").startswith("A"))
    postes = PosteSensible.objects.filter(titulaire__in=[item.agent for item in dossiers]).count()

    pyramide = []
    for libelle, bas, haut in TRANCHES:
        membres = [agent for agent in agents if agent.date_naissance and bas <= _age(agent.date_naissance, aujourd_hui) <= haut]
        pyramide.append({
            "tranche": libelle,
            "hommes": sum(1 for agent in membres if agent.sexe == "H"),
            "femmes": sum(1 for agent in membres if agent.sexe == "F"),
        })

    return {
        "compteurs": [
            {"libelle": "Lignes d'avancement", "valeur": str(nb_lignes), "detail": f"{avec_avis} avec avis rendu", "icone": "trending_up", "pourcentage": _part(avec_avis, nb_lignes)},
            {"libelle": "Demandes de mutation", "valeur": str(nb_mutations), "detail": f"{mutations_ouvertes} en cours de validation", "icone": "swap_horiz", "pourcentage": _part(nb_mutations - mutations_ouvertes, nb_mutations)},
            {"libelle": "Demandes de congé", "valeur": str(nb_conges), "detail": f"{nb_conges - conges_clos} en cours de traitement", "icone": "event_available", "pourcentage": _part(conges_clos, nb_conges)},
            {"libelle": "Éligibles à la retraite (12 mois)", "valeur": str(len(dossiers)), "detail": f"Dont {cadres} de catégorie A", "icone": "elderly", "pourcentage": _part(len(dossiers), len(agents))},
        ],
        "pyramide": pyramide,
        "departs": {
            "nombre": len(dossiers),
            "postes_direction": postes,
            "detail": (
                "Départs à la limite d'âge dans les douze prochains mois"
                + (f", dont {postes} poste{'s' if postes > 1 else ''} sensible{'s' if postes > 1 else ''} avec relève à préparer." if postes else ".")
                if dossiers else "Aucun départ à la limite d'âge dans les douze prochains mois."
            ),
        },
    }
