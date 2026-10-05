import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../api/client";
import type { Dossier, Organisme } from "../api/types";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { SelectEmploi, SelectGrade, useNomenclature } from "../ui/Nomenclature";
import { Icone } from "../ui/Icone";

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

export function SituationModal({ agent, onClose }: { agent: Dossier; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formulaire, setFormulaire] = useState(agent.situation_saisie);
  const organismes = useQuery({ queryKey: ["organismes"], queryFn: () => api<Organisme[]>("/api/v1/public/organismes/") });
  const nomenclature = useNomenclature();
  const enregistrer = useMutation({
    mutationFn: (saisie: Dossier["situation_saisie"]) =>
      api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/`, {
        method: "PATCH",
        body: JSON.stringify(saisie),
      }),
    onSuccess: (dossier) => {
      queryClient.setQueryData(["agent", agent.matricule], dossier);
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    },
  });
  function champ(cle: keyof Dossier["situation_saisie"], valeur: string) {
    setFormulaire((actuel) => ({ ...actuel, [cle]: valeur }));
  }

  const anneeConnue = /^\d{4}$/.test(agent.situation_saisie.prise_service) ? agent.situation_saisie.prise_service : "";
  const dateFonctionPublique = /^\d{4}-\d{2}-\d{2}$/.test(formulaire.prise_service) ? formulaire.prise_service : "";
  const erreur = enregistrer.error instanceof ApiError ? enregistrer.error.message : enregistrer.isError ? "L'enregistrement n'a pas abouti." : "";

  return (
    <Modale
      titre="Modifier la situation administrative"
      sousTitre={`${agent.nom_complet} · matricule ${agent.matricule}`}
      icone="badge"
      taille="xl"
      onClose={onClose}
      onSubmit={() => enregistrer.mutate(formulaire)}
      enCours={enregistrer.isPending}
      erreur={erreur || (organismes.isError ? "La liste des structures n'a pas pu être chargée." : undefined)}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={enregistrer.isPending}>
            Annuler
          </button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={enregistrer.isPending || organismes.isError}>
            {enregistrer.isPending ? <Icone nom="progress_activity" className="text-lg motion-spin" /> : null}
            {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
        <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <label className="block">
            <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Matricule</span>
            <input className={`${CHAMP} text-on-surface-variant`} value={agent.matricule} readOnly />
          </label>
          <label className="block">
            <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Structure</span>
            <select className={CHAMP} value={formulaire.organisme} onChange={(event) => champ("organisme", event.target.value)} disabled={organismes.isPending}>
              {(organismes.data ?? [{ code: formulaire.organisme, nom: agent.organisme, sigle: agent.organisme_sigle }]).map((item) => (
                <option key={item.code} value={item.code}>{item.nom}</option>
              ))}
            </select>
          </label>
          <Saisie libelle="Direction" valeur={formulaire.direction} onChange={(valeur) => champ("direction", valeur)} />
          <Saisie libelle="Sous-Direction" valeur={formulaire.sous_direction} onChange={(valeur) => champ("sous_direction", valeur)} />
          <Saisie libelle="Service" valeur={formulaire.service} onChange={(valeur) => champ("service", valeur)} />
          <Saisie libelle="Lieu de Travail" valeur={formulaire.localisation} onChange={(valeur) => champ("localisation", valeur)} />
          <label className="block">
            <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Emploi</span>
            <SelectEmploi
              className={CHAMP}
              valeur={formulaire.emploi}
              emplois={nomenclature.data?.emplois ?? []}
              onChange={(libelle, gradeChoisi) => {
                const categorie = nomenclature.data?.grades.find((item) => item.code === gradeChoisi)?.categorie;
                setFormulaire((actuel) => ({
                  ...actuel,
                  emploi: libelle,
                  grade: gradeChoisi || actuel.grade,
                  categorie: categorie || actuel.categorie,
                }));
              }}
            />
          </label>
          <Saisie libelle="Type Agent" valeur={formulaire.type_agent} onChange={(valeur) => champ("type_agent", valeur)} />
          <Saisie libelle="Mode Recrutement" valeur={formulaire.mode_recrutement} onChange={(valeur) => champ("mode_recrutement", valeur)} />
          <label className="block">
            <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Catégorie</span>
            <select className={CHAMP} value={formulaire.categorie} onChange={(event) => champ("categorie", event.target.value)}>
              {formulaire.categorie && !["A", "B", "C", "D"].includes(formulaire.categorie) ? <option value={formulaire.categorie}>{formulaire.categorie}</option> : null}
              {["A", "B", "C", "D"].map((lettre) => (
                <option key={lettre} value={lettre}>Catégorie {lettre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Grade</span>
            <SelectGrade
              className={CHAMP}
              valeur={formulaire.grade}
              grades={nomenclature.data?.grades ?? []}
              onChange={(code, categorie) => setFormulaire((actuel) => ({ ...actuel, grade: code, categorie: categorie || actuel.categorie }))}
            />
          </label>
          <Saisie libelle="Échelon" valeur={formulaire.echelon} onChange={(valeur) => champ("echelon", valeur)} />
          <label className="block">
            <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Date de première prise de service (Fonction Publique)</span>
            <input
              type="date"
              className={CHAMP}
              value={dateFonctionPublique}
              onChange={(event) => champ("prise_service", event.target.value || anneeConnue)}
            />
            {anneeConnue && !dateFonctionPublique ? <span className="block mt-1 font-label-sm text-label-sm text-on-surface-variant">Année enregistrée : {anneeConnue}. Choisissez le jour pour la préciser.</span> : null}
          </label>
          <DateSaisie libelle="Date de prise de service dans le ministère" valeur={formulaire.prise_service_ministere} onChange={(valeur) => champ("prise_service_ministere", valeur)} />
          <DateSaisie libelle="Date de prise de service dans l'emploi" valeur={formulaire.prise_service_emploi} onChange={(valeur) => champ("prise_service_emploi", valeur)} />
          <Saisie libelle="Fonction" valeur={formulaire.fonction} onChange={(valeur) => champ("fonction", valeur)} />
          <DateSaisie libelle="Date de prise de service dans la fonction" valeur={formulaire.prise_service_fonction} onChange={(valeur) => champ("prise_service_fonction", valeur)} />
          <Saisie libelle="Positions" valeur={formulaire.situation} onChange={(valeur) => champ("situation", valeur)} />
        </div>
    </Modale>
  );
}

function Saisie({ libelle, valeur, onChange }: { libelle: string; valeur: string; onChange: (valeur: string) => void }) {
  return (
    <label className="block">
      <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">{libelle}</span>
      <input className={CHAMP} value={valeur} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateSaisie({ libelle, valeur, onChange }: { libelle: string; valeur: string; onChange: (valeur: string) => void }) {
  return (
    <label className="block">
      <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">{libelle}</span>
      <input type="date" className={CHAMP} value={valeur} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
