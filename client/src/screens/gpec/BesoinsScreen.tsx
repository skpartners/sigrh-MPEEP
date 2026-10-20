import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import { nombre } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { Modale } from "../../ui/Modale";
import { CHAMP, Kpi, LIBELLE, PageGrh, PRIMAIRE, SECOND, Section } from "../grh/ui";
import { FormulaireBesoin } from "../BesoinsResponsable";
import { ArbreBesoins, LIBELLE_ETAT, TableauEmplois, dateLimite, type CampagneBesoins, type EmploiBesoins, type FicheBesoins, type ActionsBesoin, type NoeudBesoins, type TotauxBesoins } from "./besoinsCommun";

type Centralisation = {
  campagne: CampagneBesoins | null;
  peut_lancer: boolean;
  totaux: TotauxBesoins;
  arbre: NoeudBesoins[];
  emplois: EmploiBesoins[];
  fiches: FicheBesoins[];
};

/** Expression des besoins : l'appel aux responsables de structure et la centralisation de leurs réponses. */
export function BesoinsScreen() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const requete = useQuery({ queryKey: ["besoins-centralisation"], queryFn: () => api<Centralisation>("/api/v1/besoins/") });
  const [lancement, setLancement] = useState(false);
  const [correction, setCorrection] = useState<{ noeud: NoeudBesoins; ligne: NoeudBesoins["lignes"][number] } | null>(null);
  const donnees = requete.data;
  const campagne = donnees?.campagne ?? null;

  async function retirerLigne(noeud: NoeudBesoins, ligne: NoeudBesoins["lignes"][number]) {
    if (!(await feedback.confirm(`Retirer le besoin « ${ligne.emploi} » de ${noeud.nom} ?`, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(`/api/v1/besoins/fiches/${ligne.reference}/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["besoins-centralisation"] });
    }, { success: { title: "Besoin retiré" }, error: "La suppression n'a pas abouti." });
  }
  const actions: ActionsBesoin | undefined = donnees?.peut_lancer ? { modifier: (noeud, ligne) => setCorrection({ noeud, ligne }), retirer: (noeud, ligne) => void retirerLigne(noeud, ligne) } : undefined;

  async function cloturer() {
    if (!(await feedback.confirm("Clôturer l'appel ? Les responsables ne pourront plus modifier leurs besoins.", { confirmLabel: "Clôturer" }))) return;
    await feedback.run("Clôture de l'appel…", async () => {
      await api("/api/v1/besoins/campagne/cloturer/", { method: "POST", body: JSON.stringify({}) });
      await client.invalidateQueries({ queryKey: ["besoins-centralisation"] });
    }, { success: { title: "Appel clôturé" }, error: "La clôture n'a pas abouti." });
  }

  const t = donnees?.totaux;
  return (
    <PageGrh
      rubrique="Programmation des effectifs"
      titre="Expression des besoins"
      resume={campagne ? `Exercice ${campagne.exercice} · ${LIBELLE_ETAT(campagne)}${campagne.limite ? ` · réponse avant le ${dateLimite(campagne)}` : ""}` : "Aucun appel n'a été lancé aux responsables de structure."}
      chargement={requete.isLoading}
      erreur={requete.isError ? "La centralisation n'a pas pu être chargée." : undefined}
      actions={donnees?.peut_lancer ? (
        <>
          {campagne && !campagne.cloturee ? <button type="button" className={SECOND} onClick={() => void cloturer()}><Icone nom="lock" className="text-lg" />Clôturer l'appel</button> : null}
          <button type="button" className={PRIMAIRE} onClick={() => setLancement(true)}><Icone nom="campaign" className="text-lg" />{campagne ? "Relancer un appel" : "Lancer l'appel"}</button>
        </>
      ) : undefined}
    >
      {donnees && t ? (
        <>
          {campagne?.cadrage ? <p className="rounded-xl border border-hairline bg-surface-container-lowest px-6 py-4 font-body-md text-body-md text-on-surface">{campagne.cadrage}</p> : null}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icone="how_to_reg" libelle="Structures ayant répondu" valeur={`${nombre(t.reponses)} / ${nombre(t.structures)}`} detail="Structures avec un responsable" />
            <Kpi icone="badge" libelle="Fonctionnaires demandés" valeur={nombre(t.fonctionnaires)} />
            <Kpi icone="assignment_ind" libelle="Contractuels demandés" valeur={nombre(t.contractuels)} />
            <Kpi icone="groups" libelle="Agents demandés" valeur={nombre(t.volume)} detail="Fonctionnaires et contractuels" />
          </section>
          <Section titre="Centralisation par structure" icone="account_tree">
            <div className="flex justify-end mb-3">
              <button type="button" className={SECOND} onClick={() => void feedback.run("Préparation du plan…", () => telecharger("/api/v1/besoins/export/", "plan-besoins.pdf"), { success: { title: "Plan des besoins prêt" }, error: "L'export n'a pas abouti." })}>
                <Icone nom="picture_as_pdf" className="text-lg" />Exporter le plan
              </button>
            </div>
            <ArbreBesoins arbre={donnees.arbre} actions={actions} />
          </Section>
          <Section titre="Besoins par emploi" icone="work">
            <TableauEmplois emplois={donnees.emplois} />
          </Section>
        </>
      ) : null}
      {lancement ? <ModaleAppel onClose={() => setLancement(false)} /> : null}
      {correction ? (
        <FormulaireBesoin
          structures={[{ id: correction.noeud.id, nom: correction.noeud.nom }]}
          invalider={["besoins-centralisation"]}
          onClose={() => setCorrection(null)}
          fiche={{
            reference: correction.ligne.reference, entite: { id: correction.noeud.id, nom: correction.noeud.nom }, chemin: [],
            emploi: { code: correction.ligne.emploi_code, libelle: correction.ligne.emploi }, profil: correction.ligne.emploi, grade: correction.ligne.grade,
            motif: correction.ligne.motif, fonctionnaires: correction.ligne.fonctionnaires, contractuels: correction.ligne.contractuels,
            volume: correction.ligne.fonctionnaires + correction.ligne.contractuels, auteur: correction.ligne.auteur, depose_le: correction.ligne.depose_le,
          }}
        />
      ) : null}
    </PageGrh>
  );
}

function ModaleAppel({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ exercice: String(new Date().getFullYear()), limite: "", cadrage: "" });
  const envoi = useMutation({
    mutationFn: () => api<{ prevenus: number; alerte: string }>("/api/v1/besoins/campagne/", { method: "POST", body: JSON.stringify({ ...saisie, exercice: Number(saisie.exercice) }) }),
    onSuccess: async (reponse) => {
      await client.invalidateQueries({ queryKey: ["besoins-centralisation"] });
      if (reponse.alerte) feedback.toast("Appel lancé, mais personne n'est prévenu", reponse.alerte, "error");
      else feedback.toast(`Appel lancé : ${reponse.prevenus} responsable${reponse.prevenus > 1 ? "s" : ""} prévenu${reponse.prevenus > 1 ? "s" : ""}`);
      onClose();
    },
  });
  return (
    <Modale titre="Lancer l'appel" sousTitre="Chaque responsable de structure est prévenu et répond depuis son profil." icone="campaign" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.error ? "L'appel n'a pas pu être lancé." : undefined}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block"><span className={LIBELLE}>Exercice <span className="text-error">*</span></span><input className={CHAMP} required type="number" min={2000} max={2100} value={saisie.exercice} onChange={(e) => setSaisie({ ...saisie, exercice: e.target.value })} /></label>
        <label className="block"><span className={LIBELLE}>Date limite de réponse</span><input className={CHAMP} type="date" value={saisie.limite} onChange={(e) => setSaisie({ ...saisie, limite: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Consigne aux responsables</span><input className={CHAMP} maxLength={240} value={saisie.cadrage} onChange={(e) => setSaisie({ ...saisie, cadrage: e.target.value })} placeholder="Ex. Indiquez vos besoins en fonctionnaires et en contractuels." /></label>
      </div>
    </Modale>
  );
}
