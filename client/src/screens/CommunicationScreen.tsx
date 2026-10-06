import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, telecharger } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import { dateLongue, nombre } from "../ui/format";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { Pagination, usePagination } from "../ui/Pagination";
import { ActionsImport } from "./ImportAgents";
import { AppChrome } from "./AppChrome";
import { CLE_COMMUNICATION } from "./CommunicationBouton";
import { Icone } from "../ui/Icone";

type CodeLibelle = { code: string; libelle: string };
type Publication = {
  id: number;
  reference: string;
  nature: string;
  nature_libelle: string;
  urgence: string;
  intitule: string;
  corps: string;
  perimetre: string;
  perimetre_libelle: string;
  statut: string;
  statut_libelle: string;
  accuse: boolean;
  echeance: string | null;
  signataire: string;
  visa: string;
  etape_visa: string;
  taux: number;
  cible: number;
  emargements: number;
  en_attente: number;
  publiee_le: string;
  piece_nom: string;
  publique: boolean;
};
type Tableau = {
  reference_suivante: string;
  indicateurs: {
    actives: number;
    notes: number;
    circulaires: number;
    communiques: number;
    decisions: number;
    flashs: number;
    ce_mois: number;
    taux_lecture: number;
    objectif: number;
    signes: number;
    agents: number;
    en_attente: number;
    urgences: number;
    urgence_detail: string;
    echeance: string | null;
  };
  natures: CodeLibelle[];
  urgences: CodeLibelle[];
  perimetres: CodeLibelle[];
  peut_viser: boolean;
  publications: Publication[];
  visas: Publication[];
  brouillons: Publication[];
  consultation: { id: number; question: string; cloture: string; ouverte: boolean; participants: number; perimetre: string; options: { libelle: string; voix: number; part: number }[] } | null;
  sceau: { dernier: string; certificat: string };
};

const VIDE = { nature: "note", urgence: "urgent", perimetre: "tous", intitule: "", corps: "", accuse: true, echeance: "" };

export function CommunicationScreen() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const page = useQuery({ queryKey: ["communication"], queryFn: () => api<Tableau>("/api/v1/communication/") });
  const [compose, setCompose] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [saisie, setSaisie] = useState(VIDE);
  const [recherche, setRecherche] = useState("");
  const [nature, setNature] = useState("");
  const [perimetre, setPerimetre] = useState("");
  const [detail, setDetail] = useState<Publication | null>(null);
  const [sondage, setSondage] = useState(false);
  const [question, setQuestion] = useState("");
  const [cloture, setCloture] = useState("");
  const [choix, setChoix] = useState(["", ""]);
  const data = page.data;

  const liste = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (data?.publications ?? []).filter((item) => {
      const texte = `${item.intitule} ${item.reference} ${item.corps} ${item.signataire}`.toLowerCase();
      if (terme && !texte.includes(terme)) return false;
      if (nature && item.nature !== nature) return false;
      if (perimetre && item.perimetre !== perimetre) return false;
      return true;
    });
  }, [data, recherche, nature, perimetre]);
  const pages = usePagination(liste, `${recherche}|${nature}|${perimetre}`, 3);

  function noterLecture(id: number) {
    void api("/api/v1/communication/lues/", { method: "POST", body: JSON.stringify({ ids: [id] }) }).then(() => {
      void client.invalidateQueries({ queryKey: ["communication"] });
      void client.invalidateQueries({ queryKey: CLE_COMMUNICATION });
    });
  }

  function envoyer(diffuser: boolean) {
    const form = new FormData();
    form.set("nature", saisie.nature);
    form.set("urgence", saisie.urgence);
    form.set("perimetre", saisie.perimetre);
    form.set("intitule", saisie.intitule);
    form.set("corps", saisie.corps);
    form.set("accuse", saisie.accuse ? "true" : "false");
    form.set("diffuser", diffuser ? "true" : "false");
    if (saisie.echeance) form.set("echeance", saisie.echeance);
    if (fichier) form.set("fichier", fichier);
    return api<Publication>("/api/v1/communication/", { method: "POST", body: form });
  }

  const creer = useMutation({
    mutationFn: envoyer,
    onSuccess: (_reponse, diffuser) => {
      feedback.toast(diffuser ? "Publication transmise au visa du DRH" : "Brouillon enregistré");
      setSaisie({ ...VIDE, nature: data?.natures[0]?.code ?? "note" });
      setFichier(null);
      setCompose(false);
      void client.invalidateQueries({ queryKey: ["communication"] });
      void client.invalidateQueries({ queryKey: CLE_COMMUNICATION });
    },
  });
  const viser = useMutation({
    mutationFn: (id: number) => api(`/api/v1/communication/${id}/viser/`, { method: "POST" }),
    onSuccess: () => {
      feedback.toast("Publication visée et diffusée");
      void client.invalidateQueries({ queryKey: ["communication"] });
      void client.invalidateQueries({ queryKey: CLE_COMMUNICATION });
    },
  });
  const deposer = useMutation({
    mutationFn: (id: number) => api(`/api/v1/communication/${id}/soumettre/`, { method: "POST" }),
    onSuccess: () => {
      feedback.toast("Brouillon transmis au visa du DRH");
      void client.invalidateQueries({ queryKey: ["communication"] });
      void client.invalidateQueries({ queryKey: CLE_COMMUNICATION });
    },
  });
  const relancer = useMutation({
    mutationFn: (id: number) => api<{ detail: string }>(`/api/v1/communication/${id}/relancer/`, { method: "POST" }),
    onSuccess: (reponse) => feedback.toast("Relance préparée", reponse.detail),
  });
  const poserSondage = useMutation({
    mutationFn: () =>
      api("/api/v1/communication/consultation/", {
        method: "POST",
        body: JSON.stringify({ question, cloture, options: choix.map((item) => item.trim()).filter(Boolean) }),
      }),
    onSuccess: () => {
      feedback.toast("Sondage ouvert", "Il est proposé à l'ensemble des agents.");
      setSondage(false);
      setQuestion("");
      setCloture("");
      setChoix(["", ""]);
      void client.invalidateQueries({ queryKey: ["communication"] });
    },
  });

  const indicateurs = data?.indicateurs;
  const erreur = (erreurMutation: unknown) => (erreurMutation instanceof ApiError ? erreurMutation.message : "L'opération n'a pas abouti.");
  const rendrePublic = useMutation({
    mutationFn: (id: number) => api<Publication>(`/api/v1/communication/${id}/public/`, { method: "POST" }),
    onSuccess: (reponse) => {
      feedback.toast(reponse.publique ? "Communication affichée sur la page d'accueil" : "Communication retirée de la page d'accueil");
      void client.invalidateQueries({ queryKey: ["communication"] });
      void client.invalidateQueries({ queryKey: ["communications-publiques"] });
    },
  });

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-surface-container-lowest p-6 rounded-lg border border-hairline motion-rise">
          <div className="space-y-1.5 min-w-0">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Pilotage central · Communication</p>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Espace communication et publications officielles</h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">
              Notes de service, circulaires, communiqués et alertes destinés aux agents du portefeuille.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <ActionsImport
              modeleUrl="/api/v1/communication/import/modele/"
              modeleNom="modele-communications.xlsx"
              importUrl="/api/v1/communication/import/"
              titre="Importer des communications"
              sousTitre="Une ligne crée une communication, ou met à jour un brouillon déjà identifié par son intitulé."
              aide="Le modèle reprend les champs du formulaire. Soumettre à oui transmet au visa du DRH ; non, ou vide, laisse le texte en brouillon."
              toastTitre="Communications enregistrées"
              invalidations={[["communication"], ["communication-compteur"]]}
            />
            <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setCompose(true)}>
              <Icone nom="edit_note" className="text-lg" />
              Rédiger une communication
            </button>
          </div>
        </div>

        <p className="rounded-lg border border-hairline bg-surface-container-low px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
          Publications horodatées au titre du décret n° 2021-432. Certificat {data?.sceau.certificat ?? "CA-GOUV-CI-R01"}.
        </p>

        {page.isError && <p className="text-error">{erreur(page.error)}</p>}

        {indicateurs && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Carte index={0} libelle="Publications actives" valeur={nombre(indicateurs.actives)} detail={`${indicateurs.notes} notes · ${indicateurs.circulaires} circulaires · ${indicateurs.communiques + indicateurs.decisions + indicateurs.flashs} autres`} droite={`+${indicateurs.ce_mois} ce mois`} icone="library_books" />
            <Carte index={1} libelle="Taux de lecture" valeur={`${nombre(indicateurs.taux_lecture, 1)} %`} detail={`Objectif ${indicateurs.objectif} %`} droite={indicateurs.taux_lecture >= indicateurs.objectif ? "Atteint" : "Sous l'objectif"} icone="done_all" barre={indicateurs.taux_lecture} />
            <Carte index={2} libelle="Lectures" valeur={nombre(indicateurs.signes)} detail={`Sur ${nombre(indicateurs.agents)} destinataires visés`} droite={`${nombre(indicateurs.en_attente)} pas encore ouvertes`} icone="visibility" />
            <Carte index={3} libelle="Urgences actives" valeur={nombre(indicateurs.urgences)} detail={indicateurs.urgence_detail || "Aucune alerte en cours"} droite={indicateurs.echeance ? `Échéance ${dateLongue(indicateurs.echeance)}` : ""} icone="priority_high" accent />
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-3 p-4 rounded-lg bg-surface-container-lowest border border-hairline">
          <input className={`${CHAMP} flex-1`} value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Titre, référence ou signataire" aria-label="Rechercher une publication" />
          <select className={CHAMP} value={nature} aria-label="Filtrer par nature" onChange={(event) => setNature(event.target.value)}>
            <option value="">Toutes les natures</option>
            {(data?.natures ?? []).map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
          </select>
          <select className={CHAMP} value={perimetre} aria-label="Filtrer par destinataires" onChange={(event) => setPerimetre(event.target.value)}>
            <option value="">Tous les destinataires</option>
            {(data?.perimetres ?? []).map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
          </select>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={() => { setRecherche(""); setNature(""); setPerimetre(""); }}>Réinitialiser</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{nombre(liste.length)} publication{liste.length > 1 ? "s" : ""} en vigueur</h2>
            {page.isLoading && <p className="text-on-surface-variant">Chargement du registre…</p>}
            {pages.visibles.map((item) => (
              <article key={item.id} className="motion-content relative overflow-hidden rounded-lg bg-surface-container-lowest border border-hairline p-5 pl-6">
                <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.urgence === "urgent" ? "bg-secondary-container" : "bg-primary"}`} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-bold uppercase">{item.nature_libelle} {item.reference}</span>
                  <span className="font-code-num text-code-num text-on-surface-variant">{item.publiee_le}</span>
                </div>
                <h3 className="mt-2 font-headline-sm text-headline-sm text-on-surface">{item.intitule}</h3>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{item.corps}</p>
                <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
                  {item.signataire}{item.visa ? ` · ${item.visa}` : ""} · {item.perimetre_libelle}
                  {item.echeance ? ` · Échéance ${dateLongue(item.echeance)}` : ""}
                </p>
                {item.accuse && (
                  <div className="mt-3">
                    <div className="flex justify-between font-label-sm text-label-sm">
                      <span>Lectures</span>
                      <span className="font-code-num text-primary">{nombre(item.emargements)} / {nombre(item.cible)} ({nombre(item.taux)} %)</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div className="h-2 bg-primary" style={{ width: `${Math.min(item.taux, 100)}%` }} />
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={BOUTON_PRIMAIRE} onClick={() => { noterLecture(item.id); setDetail(item); }}>Détails</button>
                  {data?.peut_viser && item.statut === "diffuse" ? (
                    <button type="button" className={BOUTON_SECONDAIRE} disabled={rendrePublic.isPending} onClick={() => rendrePublic.mutate(item.id)}>
                      {item.publique ? "Retirer de l'accueil" : "Rendre public"}
                    </button>
                  ) : null}
                  {item.publique ? <span className="inline-flex items-center px-2.5 py-1.5 font-label-sm text-label-sm font-bold text-primary">Sur la page d'accueil</span> : null}
                  <button type="button" className={BOUTON_SECONDAIRE} onClick={() => { noterLecture(item.id); void telecharger(`/api/v1/communication/${item.id}/pdf/`, `publication-${item.id}.pdf`); }}>Acte PDF</button>
                  {item.piece_nom ? (
                    <button type="button" className={BOUTON_SECONDAIRE} onClick={() => { noterLecture(item.id); void telecharger(`/api/v1/communication/${item.id}/piece/`, item.piece_nom); }}>
                      <Icone nom="attach_file" className="text-lg" />
                      {item.piece_nom}
                    </button>
                  ) : null}
                  {item.en_attente > 0 && (
                    <button type="button" className={BOUTON_SECONDAIRE} onClick={() => relancer.mutate(item.id)}>Relancer {nombre(item.en_attente)}</button>
                  )}
                </div>
              </article>
            ))}
            <Pagination page={pages.page} pages={pages.pages} total={pages.total} aller={pages.aller} libelle="publication" />
          </div>

          <div className="lg:col-span-4 space-y-5">
            {(data?.brouillons.length ?? 0) > 0 && (
              <section className="rounded-lg bg-surface-container-lowest border border-hairline p-5 space-y-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Brouillons ({data?.brouillons.length})</h2>
                {data?.brouillons.map((item) => (
                  <div key={item.id} className="rounded bg-surface-container-low p-3 space-y-2">
                    <p className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase">{item.reference}</p>
                    <p className="font-body-sm text-body-sm text-on-surface">{item.intitule}</p>
                    <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => deposer.mutate(item.id)}>Soumettre au visa du DRH</button>
                  </div>
                ))}
              </section>
            )}
            <section className="rounded-lg bg-surface-container-lowest border border-hairline p-5 space-y-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Visa du DRH ({data?.visas.length ?? 0})</h2>
              {(data?.visas ?? []).map((item) => (
                <div key={item.id} className="rounded bg-surface-container-low p-3 space-y-2">
                  <p className="font-label-sm text-label-sm text-secondary font-bold uppercase">{item.reference}</p>
                  <p className="font-body-sm text-body-sm text-on-surface">{item.intitule}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">{item.etape_visa || "Attente du visa du DRH"}</p>
                  {data?.peut_viser ? (
                    <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => viser.mutate(item.id)}>Viser et diffuser</button>
                  ) : (
                    <p className="font-label-sm text-label-sm text-on-surface-variant">La diffusion attend le visa du DRH.</p>
                  )}
                </div>
              ))}
              {(data?.visas.length ?? 0) === 0 && <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun projet en attente du DRH.</p>}
              <Link to="/app/circuits" className="block text-center font-label-md text-label-md text-primary hover:underline">Registre des circuits</Link>
            </section>

            <section className="rounded-lg bg-surface-container-lowest border border-hairline p-5 space-y-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Sondage</h2>
              {data?.consultation ? (
                <>
                  <p className="font-body-sm text-body-sm text-on-surface">{data.consultation.question}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {data.consultation.perimetre} · clôture {dateLongue(data.consultation.cloture)} · {nombre(data.consultation.participants)} réponse{data.consultation.participants > 1 ? "s" : ""}
                  </p>
                  {data.consultation.options.map((option) => (
                    <div key={option.libelle}>
                      <div className="flex justify-between font-label-sm text-label-sm">
                        <span>{option.libelle}</span>
                        <span className="font-code-num">{nombre(option.voix)} · {nombre(option.part, 1)} %</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                        <div className="h-2 bg-primary" style={{ width: `${option.part}%` }} />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun sondage n'est ouvert.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {data?.consultation ? (
                  <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => void telecharger("/api/v1/communication/consultation/export/", "sondage.pdf")}>Exporter le rapport</button>
                ) : null}
                <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setSondage(true)}>Nouveau sondage</button>
              </div>
            </section>

            <section className="rounded-lg bg-surface-container-low p-4 space-y-2">
              <h2 className="font-label-md text-label-md text-on-surface font-bold uppercase">Traçabilité</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Dernier horodatage : {data?.sceau.dernier || "—"}. Certificat {data?.sceau.certificat}.</p>
            </section>
          </div>
        </div>
      </div>

      {detail && (
        <Modale titre={detail.reference} sousTitre={detail.nature_libelle} icone="library_books" taille="lg" onClose={() => setDetail(null)} libelleValider="Fermer" onSubmit={() => setDetail(null)}>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">{detail.intitule}</h3>
          <p className="mt-3 font-body-md text-body-md text-on-surface whitespace-pre-wrap">{detail.corps}</p>
          {detail.piece_nom ? (
            <button type="button" className={`${BOUTON_SECONDAIRE} mt-4`} onClick={() => void telecharger(`/api/v1/communication/${detail.id}/piece/`, detail.piece_nom)}>
              <Icone nom="attach_file" className="text-lg" />
              {detail.piece_nom}
            </button>
          ) : null}
        </Modale>
      )}
      {compose && data && (
        <Modale
          titre="Rédiger une communication"
          sousTitre="Elle reste invisible tant que le DRH ne l'a pas visée."
          icone="edit_note"
          taille="lg"
          onClose={() => { if (!creer.isPending) setCompose(false); }}
          onSubmit={() => creer.mutate(true)}
          enCours={creer.isPending}
          erreur={creer.isError ? erreur(creer.error) : undefined}
          pied={(
            <>
              <button type="button" className={BOUTON_SECONDAIRE} disabled={creer.isPending} onClick={() => setCompose(false)}>Annuler</button>
              <button type="button" className={BOUTON_SECONDAIRE} disabled={creer.isPending} onClick={() => creer.mutate(false)}>Enregistrer en brouillon</button>
              <button type="submit" className={BOUTON_PRIMAIRE} disabled={creer.isPending}>Soumettre au visa du DRH</button>
            </>
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Champ libelle="Nature">
              <select className={CHAMP} value={saisie.nature} onChange={(event) => setSaisie({ ...saisie, nature: event.target.value })}>
                {data.natures.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </select>
            </Champ>
            <Champ libelle="Urgence">
              <select className={CHAMP} value={saisie.urgence} onChange={(event) => setSaisie({ ...saisie, urgence: event.target.value })}>
                {data.urgences.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </select>
            </Champ>
            <Champ libelle="Référence">
              <input className={CHAMP} readOnly value={data.reference_suivante} />
            </Champ>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="md:col-span-2 flex flex-col gap-1 font-label-md text-label-md text-on-surface">
              Intitulé
              <input className={CHAMP} required maxLength={240} value={saisie.intitule} onChange={(event) => setSaisie({ ...saisie, intitule: event.target.value })} />
            </label>
            <Champ libelle="Destinataires">
              <select className={CHAMP} value={saisie.perimetre} onChange={(event) => setSaisie({ ...saisie, perimetre: event.target.value })}>
                {data.perimetres.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </select>
            </Champ>
          </div>
          <label className="mt-4 flex flex-col gap-1 font-label-md text-label-md text-on-surface">
            Corps du texte
            <textarea className={`${CHAMP} h-28 py-2`} required value={saisie.corps} onChange={(event) => setSaisie({ ...saisie, corps: event.target.value })} />
          </label>
          <label className="mt-4 flex flex-col gap-1 font-label-md text-label-md text-on-surface">
            Pièce jointe
            <input className={`${CHAMP} py-1.5`} type="file" accept=".pdf,.doc,.docx,.odt,.png,.jpg,.jpeg,.webp" onChange={(event) => setFichier(event.target.files?.[0] ?? null)} />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
              <input type="checkbox" checked={saisie.accuse} onChange={(event) => setSaisie({ ...saisie, accuse: event.target.checked })} />
              Compter l'ouverture par chaque destinataire
            </label>
            <label className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
              Échéance
              <input className={CHAMP} type="date" value={saisie.echeance} onChange={(event) => setSaisie({ ...saisie, echeance: event.target.value })} />
            </label>
          </div>
        </Modale>
      )}
      {sondage && (
        <Modale
          titre="Nouveau sondage"
          sousTitre="Il est proposé à l'ensemble des agents, qui répondent depuis leur espace."
          icone="poll"
          onClose={() => setSondage(false)}
          onSubmit={() => poserSondage.mutate()}
          enCours={poserSondage.isPending}
          erreur={poserSondage.isError ? erreur(poserSondage.error) : undefined}
          libelleValider="Ouvrir le sondage"
        >
          <div className="space-y-4">
            <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
              Question
              <textarea className={`${CHAMP} h-24 py-2`} required maxLength={240} value={question} onChange={(event) => setQuestion(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
              Clôture
              <input className={CHAMP} type="date" required value={cloture} onChange={(event) => setCloture(event.target.value)} />
            </label>
            <fieldset className="space-y-2">
              <legend className="font-label-md text-label-md text-on-surface">Réponses proposées</legend>
              {choix.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className={CHAMP}
                    maxLength={160}
                    value={item}
                    placeholder={`Réponse ${index + 1}`}
                    onChange={(event) => setChoix(choix.map((valeur, position) => (position === index ? event.target.value : valeur)))}
                  />
                  {choix.length > 2 ? (
                    <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setChoix(choix.filter((_, position) => position !== index))}>Retirer</button>
                  ) : null}
                </div>
              ))}
              {choix.length < 6 ? (
                <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => setChoix([...choix, ""])}>Ajouter une réponse</button>
              ) : null}
            </fieldset>
          </div>
        </Modale>
      )}
    </AppChrome>
  );
}

const CHAMP = "h-10 w-full px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

function Champ({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
      {libelle}
      {children}
    </label>
  );
}

function Carte({ libelle, valeur, detail, droite, icone, barre, accent = false, index = 0 }: { libelle: string; valeur: string; detail: string; droite: string; icone: string; barre?: number; accent?: boolean; index?: number }) {
  return (
    <article className="motion-card-appear p-5 rounded-lg bg-surface-container-lowest border border-hairline" style={{ "--delay": `${index * 70}ms` } as CSSProperties}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`font-label-sm text-label-sm uppercase tracking-wider font-semibold ${accent ? "text-secondary" : "text-on-surface-variant"}`}>{libelle}</p>
          <p className={`mt-2 font-headline-lg text-headline-lg ${accent ? "text-secondary" : "text-on-surface"}`}>{valeur}</p>
        </div>
        <Icone nom={icone} className="text-primary" />
      </div>
      {barre !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div className="h-1.5 bg-primary" style={{ width: `${Math.min(barre, 100)}%` }} />
        </div>
      )}
      <p className="mt-3 flex justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
        <span className="truncate">{detail}</span>
        <span className="shrink-0 text-primary font-semibold">{droite}</span>
      </p>
    </article>
  );
}
