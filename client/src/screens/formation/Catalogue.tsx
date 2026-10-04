import { useState } from "react";
import { pluriel } from "../../ui/format";
import { useAction } from "../../ui/useAction";
import type { TableauFormation, TypeFormation } from "./types";
import { BOUTON_ICONE, BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, CARTE, Case, EnTeteSection, Modale, Texte, Vide, messageErreur, useEnregistrement } from "./ui";

/** Catalogue : cycles de formation, publics concernés, pièce exigée à la candidature. */
export function Catalogue({ data }: { data: TableauFormation }) {
  const [edition, setEdition] = useState<TypeFormation | "nouveau" | null>(null);
  const { agir } = useAction();

  function supprimer(t: TypeFormation) {
    void agir({
      confirmation: `Retirer le cycle « ${t.libelle} » du catalogue ?`,
      confirmLabel: "Retirer",
      attente: "Retrait du cycle…",
      route: `/api/v1/formation/types/${t.code}/`,
      methode: "DELETE",
      succes: "Cycle retiré du catalogue",
    });
  }

  return (
    <section aria-labelledby="titre-catalogue">
      <EnTeteSection
        icone="menu_book"
        titre="Catalogue des cycles"
        sousTitre="Chaque module du plan relève d'un cycle ; le cycle fixe les publics et la pièce exigée."
        action={
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setEdition("nouveau")}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
            Nouveau cycle
          </button>
        }
      />
      {data.types.length === 0 ? (
        <Vide icone="menu_book" titre="Catalogue vide" texte="Créez le premier cycle de formation." />
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.types.map((t) => (
            <li key={t.code} className={`${CARTE} motion-content p-5 flex flex-col gap-3`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-code-num text-code-num text-primary font-bold">{t.code}</span>
                  <h3 className="font-label-lg text-label-lg text-on-surface font-bold mt-0.5">{t.libelle}</h3>
                </div>
                <div className="flex shrink-0">
                  <button type="button" className={BOUTON_ICONE} onClick={() => setEdition(t)} aria-label={`Modifier ${t.libelle}`} title="Modifier">
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
                  </button>
                  <button
                    type="button"
                    className={BOUTON_ICONE}
                    onClick={() => supprimer(t)}
                    disabled={t.sessions > 0}
                    aria-label={`Retirer ${t.libelle}`}
                    title={t.sessions ? "Utilisé par des modules : retrait impossible" : "Retirer"}
                  >
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                  </button>
                </div>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Publics concernés</p>
                {t.publics.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {t.publics.map((p) => <li key={p} className="px-2 py-0.5 rounded bg-surface-container font-label-sm text-label-sm text-on-surface">{p}</li>)}
                  </ul>
                ) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant italic">Aucun public précisé</p>
                )}
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-auto flex flex-wrap gap-x-4 gap-y-1">
                <span>{pluriel(t.sessions, "module")}</span>
                <span>{t.piece_requise ? `Pièce exigée : ${t.piece_libelle}` : "Aucune pièce exigée"}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {edition ? <FormulaireType type={edition === "nouveau" ? null : edition} onClose={() => setEdition(null)} /> : null}
    </section>
  );
}

function FormulaireType({ type, onClose }: { type: TypeFormation | null; onClose: () => void }) {
  const [code, setCode] = useState(type?.code ?? "");
  const [libelle, setLibelle] = useState(type?.libelle ?? "");
  const [publics, setPublics] = useState<string[]>(type?.publics.length ? type.publics : [""]);
  const [piece, setPiece] = useState(type?.piece_requise ?? false);
  const [pieceLibelle, setPieceLibelle] = useState(type?.piece_libelle ?? "");
  const enregistrer = useEnregistrement<TypeFormation>(onClose, type ? "Cycle mis à jour" : "Cycle ajouté au catalogue");

  return (
    <Modale
      titre={type ? "Modifier le cycle" : "Nouveau cycle de formation"}
      onClose={onClose}
      onSubmit={() =>
        enregistrer.mutate({
          route: type ? `/api/v1/formation/types/${type.code}/` : "/api/v1/formation/types/",
          methode: type ? "PATCH" : "POST",
          corps: { code, libelle, publics: publics.filter((p) => p.trim()), piece_requise: piece, piece_libelle: pieceLibelle },
        })
      }
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {type ? (
          <label className="block">
            <span className="block font-label-md text-label-md text-on-surface mb-1">Code</span>
            <input className="w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-low font-code-num text-code-num text-on-surface-variant" value={type.code} readOnly />
          </label>
        ) : (
          <Texte libelle="Code" obligatoire max={40} valeur={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="Ex. PERF" aide="Lettres majuscules, chiffres, tirets." />
        )}
        <Texte libelle="Intitulé du cycle" obligatoire max={160} valeur={libelle} onChange={setLibelle} className="sm:col-span-2" />
      </div>
      <fieldset className="mt-5">
        <legend className="font-label-md text-label-md text-on-surface mb-2">Publics concernés</legend>
        <ul className="space-y-2">
          {publics.map((p, index) => (
            <li key={index} className="flex gap-2">
              <input
                className="flex-1 h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={p}
                maxLength={160}
                aria-label={`Public ${index + 1}`}
                placeholder="Ex. Fonctionnaires nommés à un poste de responsabilité"
                onChange={(e) => setPublics((liste) => liste.map((x, i) => (i === index ? e.target.value : x)))}
              />
              <button type="button" className={BOUTON_ICONE} onClick={() => setPublics((liste) => liste.filter((_, i) => i !== index))} aria-label={`Retirer le public ${index + 1}`} disabled={publics.length === 1}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">remove_circle</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={`${BOUTON_SECONDAIRE} mt-2 h-9`} onClick={() => setPublics((liste) => [...liste, ""])}>
          <span className="material-symbols-outlined text-base" aria-hidden="true">add</span>
          Ajouter un public
        </button>
      </fieldset>
      <div className="mt-5 space-y-3">
        <Case libelle="Une pièce est exigée à la candidature" aide="Pour les cas que le dossier de l'agent ne permet pas de vérifier." coche={piece} onChange={setPiece} />
        {piece ? <Texte libelle="Pièce exigée" obligatoire max={160} valeur={pieceLibelle} onChange={setPieceLibelle} placeholder="Ex. Document d'inscription au concours" /> : null}
      </div>
    </Modale>
  );
}
