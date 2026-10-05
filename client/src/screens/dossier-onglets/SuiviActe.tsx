import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, mediaUrl } from "../../api/client";
import type { Acte, Dossier } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { dateFr } from "./commun";
import { Icone } from "../../ui/Icone";

/**
 * Parcours d'un acte, tel que l'agent doit pouvoir le suivre :
 * 1. instruction → 2. visas apposés (signatures électroniques sur le document qui circule)
 * → 3. papier à en-tête établi puis scanné → 4. droit ouvert.
 * Le papier à en-tête n'est édité qu'après l'accord : aucun papier gâché sur un refus.
 */
const ETAPES = [
  { titre: "Instruction", detail: "Le dossier est examiné par la hiérarchie." },
  { titre: "Visas apposés", detail: "Les responsables signent le document qui circule." },
  { titre: "Papier à en-tête", detail: "L'acte est édité sur papier officiel, puis scanné." },
  { titre: "Droit ouvert", detail: "Le scan est versé au dossier : l'agent peut en bénéficier." },
];

function etapeActe(acte: Acte): number {
  if (acte.statut === "valide") return 4;
  if (acte.statut === "accorde") return 2;
  return 0;
}

export function SuiviActe({ acte, matricule }: { acte: Acte; matricule: string }) {
  const [fiche, setFiche] = useState(false);
  const [scan, setScan] = useState(false);
  if (acte.statut === "rejete") return null;
  const atteinte = etapeActe(acte);
  return (
    <div className="mt-4 space-y-3">
      <ol className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2 md:grid-cols-4" aria-label="Avancement de l'acte">
        {ETAPES.map((etape, index) => {
          const faite = index < atteinte;
          const courante = index === atteinte;
          return (
            <li
              key={etape.titre}
              className={`rounded-lg p-3 ${courante ? "bg-secondary-fixed/40" : faite ? "bg-surface-container-lowest" : "bg-surface-container-lowest/50 opacity-70"}`}
              aria-current={courante ? "step" : undefined}
            >
              <div className="flex items-center gap-2">
                <Icone nom={faite ? "check_circle" : courante ? "pending" : "radio_button_unchecked"} className={`text-lg ${faite ? "text-primary" : courante ? "text-secondary" : "text-on-surface-variant"}`} />
                <span className="font-label-md text-label-md font-bold text-on-surface">{etape.titre}</span>
              </div>
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{etape.detail}</p>
            </li>
          );
        })}
      </ol>

      {acte.signatures.length ? (
        <div className="flex flex-wrap items-center gap-3">
          {acte.signatures.map((signature) => (
            <figure key={signature.signature_url} className="flex items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-2">
              <img src={mediaUrl(signature.signature_url)} alt={`Signature de ${signature.signataire || "l'autorité"}`} className="h-9 max-w-[140px] object-contain" />
              <figcaption className="font-label-sm text-label-sm text-on-surface-variant">
                {signature.signataire || "Visa DRH"}
                {signature.date ? <span className="block">{dateFr(signature.date)}</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setFiche(true)}>
          <Icone nom="description" className="text-lg" />
          Document qui circule
        </button>
        {acte.statut === "accorde" ? (
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setScan(true)}>
            <Icone nom="document_scanner" className="text-lg" />
            Verser le papier à en-tête scanné
          </button>
        ) : null}
        {acte.scan_url ? (
          <a className={BOUTON_SECONDAIRE} href={mediaUrl(acte.scan_url)} target="_blank" rel="noreferrer">
            <Icone nom="verified" className="text-lg" />
            Papier à en-tête versé
          </a>
        ) : null}
      </div>

      {fiche ? <FicheCirculation acte={acte} onClose={() => setFiche(false)} /> : null}
      {scan ? <VersementScan acte={acte} matricule={matricule} onClose={() => setScan(false)} /> : null}
    </div>
  );
}

/** Le document qui circule pour signature : il porte les visas apposés, avant toute édition sur papier officiel. */
function FicheCirculation({ acte, onClose }: { acte: Acte; onClose: () => void }) {
  const agent = acte.agent;
  return (
    <Modale
      titre="Document qui circule"
      sousTitre={`${acte.nature} n° ${acte.reference}`}
      icone="description"
      taille="2xl"
      onClose={onClose}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>Fermer</button>
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => window.print()}>
            <Icone nom="print" className="text-lg" />
            Imprimer
          </button>
        </>
      }
    >
      <article className="zone-impression rounded-lg border border-hairline bg-white p-8 text-[#0b1c30]">
        <header className="flex items-start justify-between gap-6 border-b border-[#0b1c30]/15 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider">République de Côte d'Ivoire</p>
            <p className="text-xs">Union – Discipline – Travail</p>
            <p className="mt-2 text-sm font-semibold">Ministère du Portefeuille de l'État et des Entreprises Publiques</p>
            <p className="text-xs">Direction des Ressources Humaines</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">Document de circulation</p>
            <p>Réf. {acte.reference}</p>
            <p>Enregistré le {dateFr(acte.date_enregistrement)}</p>
          </div>
        </header>

        <h2 className="mt-6 text-center text-lg font-bold uppercase">{acte.titre}</h2>
        <p className="mt-1 text-center text-sm">{acte.nature}</p>

        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <dt className="text-[#0b1c30]/70">Agent</dt>
          <dd className="font-semibold">{agent.nom_complet}</dd>
          <dt className="text-[#0b1c30]/70">Matricule</dt>
          <dd className="font-semibold">{agent.matricule}</dd>
          <dt className="text-[#0b1c30]/70">Emploi</dt>
          <dd>{agent.corps} · grade {agent.grade}, échelon {agent.echelon}</dd>
          <dt className="text-[#0b1c30]/70">Affectation</dt>
          <dd>{acte.organisme} · {acte.structure}</dd>
          <dt className="text-[#0b1c30]/70">Date d'effet</dt>
          <dd>{acte.date_effet ? dateFr(acte.date_effet) : "À fixer"}</dd>
        </dl>

        {acte.resume ? <p className="mt-6 text-sm leading-relaxed">{acte.resume}</p> : null}

        <section className="mt-8">
          <h3 className="text-sm font-bold uppercase tracking-wider">Visas</h3>
          {acte.signatures.length ? (
            <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {acte.signatures.map((signature) => (
                <div key={signature.signature_url} className="text-sm">
                  <p className="font-semibold">{signature.signataire || "Le Directeur des Ressources Humaines"}</p>
                  {signature.date ? <p className="text-xs text-[#0b1c30]/70">Visé le {dateFr(signature.date)}</p> : null}
                  <img src={mediaUrl(signature.signature_url)} alt={`Signature de ${signature.signataire || "l'autorité"}`} className="mt-2 h-20 max-w-full object-contain" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded border border-dashed border-[#0b1c30]/25 p-4 text-sm text-[#0b1c30]/70">
              En attente des visas. Le papier à en-tête ne s'édite qu'une fois l'accord des responsables acquis.
            </p>
          )}
        </section>

        <footer className="mt-10 border-t border-[#0b1c30]/15 pt-3 text-xs text-[#0b1c30]/70">
          Document interne de circulation. Seul le papier à en-tête, établi après accord puis scanné et versé au dossier, ouvre le droit de l'agent.
        </footer>
      </article>
    </Modale>
  );
}

function VersementScan({ acte, matricule, onClose }: { acte: Acte; matricule: string; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function verser() {
    if (!fichier) {
      setErreur("Choisissez le scan du papier à en-tête.");
      return;
    }
    const corps = new FormData();
    corps.set("fichier", fichier);
    setEnCours(true);
    setErreur("");
    try {
      const dossier = await api<Dossier>(`/api/v1/actes/${acte.id}/scan/`, { method: "POST", body: corps });
      client.setQueryData(["agent", matricule], dossier);
      await client.invalidateQueries();
      feedback.toast("Droit ouvert", `Le papier à en-tête est versé au dossier de ${acte.agent.nom_complet}.`);
      onClose();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Le scan n'a pas pu être versé.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      titre="Verser le papier à en-tête scanné"
      sousTitre={`${acte.titre} · ${acte.agent.nom_complet}`}
      icone="document_scanner"
      taille="md"
      onClose={onClose}
      onSubmit={() => void verser()}
      libelleValider="Verser et ouvrir le droit"
      enCours={enCours}
      erreur={erreur || undefined}
    >
      <div className="space-y-4">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Les visas sont apposés. Éditez l'acte sur papier à en-tête, faites-le signer, puis versez ici son scan : c'est ce versement qui ouvre le droit de l'agent.
        </p>
        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
            Scan (PDF, PNG, JPG ou WEBP) <span className="text-error">*</span>
          </span>
          <input
            className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-sm text-body-sm text-on-surface file:mr-3 file:rounded file:border-0 file:bg-surface-container-high file:px-3 file:py-1"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            onChange={(event) => {
              setFichier(event.target.files?.[0] ?? null);
              setErreur("");
            }}
          />
        </label>
        {fichier ? <p className="font-label-md text-label-md text-primary font-semibold">{fichier.name}</p> : null}
      </div>
    </Modale>
  );
}
