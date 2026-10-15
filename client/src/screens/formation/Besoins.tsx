import { useState } from "react";
import { dateCourte, nombre } from "../../ui/format";
import { Pagination, usePagination } from "../../ui/Pagination";
import { useFlip } from "../../ui/Motion";
import { useAction } from "../../ui/useAction";
import type { Besoin, TableauFormation } from "./types";
import { BOUTON_PRIMAIRE, Badge, CARTE, DateChamp, EnTeteSection, Modale, Vide, Zone, messageErreur, useEnregistrement } from "./ui";
import { Icone } from "../../ui/Icone";

const TON_PRIORITE = { haute: "bg-error-container text-on-error-container", moyenne: "bg-secondary-fixed text-on-secondary-fixed", basse: "bg-surface-container text-on-surface-variant" };
const TON_STATUT = { exprime: "bg-surface-container-high text-on-surface", retenu: "bg-secondary-fixed text-on-secondary-fixed", couvert: "bg-primary-fixed text-on-primary-fixed" };

/** Collecte des besoins auprès des agents du ministère, puis suivi des réponses. */
export function Besoins({ data }: { data: TableauFormation }) {
  const [lancer, setLancer] = useState(false);
  const collecte = data.collecte;
  const { agir } = useAction();
  const pageBesoins = usePagination(data.besoins, String(data.besoins.length));
  const corps = useFlip<HTMLTableSectionElement>(String(data.besoins.length));

  function cloturer() {
    void agir({
      confirmation: "Clôturer la collecte ? Les agents qui n'ont pas répondu ne seront plus relancés.",
      confirmLabel: "Clôturer",
      attente: "Clôture de la collecte…",
      route: "/api/v1/formation/collecte/cloturer/",
      succes: "Collecte clôturée",
    });
  }

  return (
    <section aria-labelledby="titre-besoins">
      <EnTeteSection
        icone="analytics"
        titre="Collecte des besoins"
        sousTitre="Le ministère envoie la demande à chaque agent. L'agent renseigne ses besoins dans son profil, ou indique RAS."
        action={
          collecte?.ouverte ? (
            <button type="button" className="h-10 px-3 rounded border border-outline-variant font-label-md text-label-md hover:bg-surface-container" onClick={cloturer}>
              Clôturer la collecte
            </button>
          ) : (
            <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setLancer(true)}>
              <Icone nom="campaign" className="text-lg" />
              Lancer la collecte
            </button>
          )
        }
      />

      {collecte ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Indicateur libelle="Agents concernés" valeur={nombre(collecte.destinataires)} />
          <Indicateur libelle="Ont répondu" valeur={nombre(collecte.repondu)} />
          <Indicateur libelle="RAS" valeur={nombre(collecte.ras)} />
          <Indicateur libelle="En attente" valeur={nombre(collecte.en_attente)} accent={collecte.ouverte && collecte.en_attente > 0} />
        </div>
      ) : (
        <div className={`${CARTE} p-5 mb-5`}>
          <p className="font-body-sm text-body-sm text-on-surface">Aucune collecte n'a encore été lancée pour l'exercice {data.exercice}.</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Lancez-la : chaque agent reçoit une alerte et une notification jusqu'à ce qu'il renseigne ses besoins ou dise RAS.</p>
        </div>
      )}

      {collecte ? (
        <p className="font-body-sm text-body-sm text-on-surface mb-4">
          {collecte.ouverte ? "Collecte ouverte" : "Collecte close"} jusqu'au {dateCourte(collecte.date_limite)}
          {collecte.communique ? ` · ${collecte.communique}` : ""}
        </p>
      ) : null}

      {data.besoins.length === 0 ? (
        <Vide icone="analytics" titre="Aucun besoin exprimé" texte={collecte?.ouverte ? "Les réponses des agents apparaîtront ici." : "Lancez une collecte pour recevoir les besoins des agents."} />
      ) : (
        <div className={`${CARTE} overflow-x-auto`}>
          <table className="w-full min-w-[44rem] text-left font-body-sm text-body-sm">
            <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th className="py-3 px-4">Besoin</th>
                <th className="py-3 px-4">Agent</th>
                <th className="py-3 px-4 text-right">Agents</th>
                <th className="py-3 px-4">Priorité</th>
                <th className="py-3 px-4">Statut</th>
              </tr>
            </thead>
            <tbody ref={corps}>
              {pageBesoins.visibles.map((b) => (
                <tr key={b.id} data-flip={b.id} className="motion-content border-t border-hairline align-top">
                  <td className="py-3 px-4">
                    <span className="block font-label-lg text-label-lg text-on-surface">{b.intitule}</span>
                    <span className="block text-on-surface-variant">{b.structure.nom} · {dateCourte(b.exprime_le)}</span>
                  </td>
                  <td className="py-3 px-4 text-on-surface">{b.agent?.nom_complet ?? "—"}</td>
                  <td className="py-3 px-4 text-right font-code-num text-code-num">{nombre(b.effectif)}</td>
                  <td className="py-3 px-4"><Badge ton={TON_PRIORITE[b.priorite]}>{b.priorite_libelle}</Badge></td>
                  <td className="py-3 px-4">
                    <Badge ton={TON_STATUT[b.statut]}>{b.statut_libelle}</Badge>
                    {b.session ? <span className="block mt-1 text-on-surface-variant">par « {b.session.libelle} »</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={pageBesoins.page} pages={pageBesoins.pages} total={pageBesoins.total} aller={pageBesoins.aller} libelle="besoin" />
        </div>
      )}
      {lancer ? <LancerCollecte onClose={() => setLancer(false)} /> : null}
    </section>
  );
}

function Indicateur({ libelle, valeur, accent }: { libelle: string; valeur: string; accent?: boolean }) {
  return (
    <div className={`${CARTE} p-4`}>
      <p className="font-label-sm text-label-sm text-on-surface-variant">{libelle}</p>
      <p className={`mt-1 font-headline-sm text-headline-sm font-bold ${accent ? "text-secondary" : "text-on-surface"}`}>{valeur}</p>
    </div>
  );
}

function LancerCollecte({ onClose }: { onClose: () => void }) {
  const [dateLimite, setDateLimite] = useState("");
  const [communique, setCommunique] = useState("Le ministère recueille vos besoins de formation. Renseignez-les dans votre profil, ou indiquez RAS si vous n'avez rien à signaler.");
  const enregistrer = useEnregistrement(onClose, "Collecte lancée : les agents sont notifiés");
  return (
    <Modale
      titre="Lancer la collecte des besoins"
      sousTitre="Chaque agent reçoit une alerte. La notification clignote sur son profil jusqu'à sa réponse."
      onClose={onClose}
      onSubmit={() => enregistrer.mutate({ route: "/api/v1/formation/collecte/", methode: "POST", corps: { date_limite: dateLimite, communique } })}
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
      libelleValider="Envoyer aux agents"
    >
      <DateChamp libelle="Répondre avant le" obligatoire valeur={dateLimite} onChange={setDateLimite} />
      <Zone libelle="Message aux agents" max={280} valeur={communique} onChange={setCommunique} className="mt-4" />
    </Modale>
  );
}

export type { Besoin };
