"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import ProjectNav from "@/components/project/ProjectNav";
import Modal from "@/components/ui/Modal";
import SaveDialog from "@/components/ui/SaveDialog";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import { clearLocalCopy, loadLocalCopy, saveLocalCopy, type LocalCopy } from "@/lib/client/drafts";
import { useApiData, useBeforeUnload } from "@/lib/client/hooks";
import { shortId } from "@/lib/project/slug";
import {
  allSections,
  applyTemplate,
  battuteFromWords,
  changeMeasure,
  measureOf,
  moveScene,
  sectionTargets,
  totalBattute,
  scenesIn,
  SCENE_STATUS_LABEL,
  totalWeight,
  type Scene,
  type StructureAct,
  type StructureTemplate,
  type WorkStructure,
} from "@/lib/project/structure";
import type { ProjectData } from "@/lib/server/projects";
import type { SheetsData } from "@/lib/server/sheets";
import type { ChapterStats, LibraryData } from "@/lib/server/structures";
import { formatCount } from "@/lib/text/stats";
import ActsEditor from "./ActsEditor";
import SceneEditor from "./SceneEditor";

type Tab = "bacheca" | "insieme" | "sezioni";
const LOCAL_KIND = "struttura";

function newScene(sezione: string | null): Scene {
  return {
    id: shortId(),
    titolo: "",
    sezione,
    capitolo: null,
    stato: "idea",
    sinossi: "",
    obiettivo: "",
    conflitto: "",
    esito: "",
    pov: null,
    luogo: null,
    quando: "",
    personaggi: [],
  };
}

/** Scene di sezioni che non esistono più (atti modificati) → «Non assegnate». */
function withValidSections(doc: WorkStructure, atti: StructureAct[]): WorkStructure {
  const ids = new Set(allSections(atti).map((s) => s.id));
  return { ...doc, atti, scene: doc.scene.map((s) => (s.sezione && !ids.has(s.sezione) ? { ...s, sezione: null } : s)) };
}

export default function WorkStructureView({ owner, repo, work }: { owner: string; repo: string; work: string }) {
  const base = projectApi(owner, repo);
  const project = useApiData<ProjectData>(base);
  const sheets = useApiData<SheetsData>(`${base}/schede`);
  const stats = useApiData<{ capitoli: ChapterStats[] }>(`${base}/opere/${work}/statistiche`);

  const [doc, setDoc] = useState<WorkStructure | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<ClientApiError | null>(null);
  const [committed, setCommitted] = useState("null");
  const [conflict, setConflict] = useState<LocalCopy<WorkStructure> | null>(null);
  const [tab, setTab] = useState<Tab>("bacheca");
  const [editing, setEditing] = useState<{ scene: Scene; isNew: boolean } | null>(null);
  const [dialog, setDialog] = useState<"salva" | "modello" | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error" | "warn" | "info"; text: string } | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const shaRef = useRef<string | null>(null);
  const dragged = useRef<string | null>(null);

  const dirty = loaded && JSON.stringify(doc) !== committed;
  useBeforeUnload(dirty);

  // Caricamento della struttura e dell'eventuale copia locale non salvata.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ sha: string | null; struttura: WorkStructure | null }>(`${base}/opere/${work}/struttura`),
      loadLocalCopy<WorkStructure>(LOCAL_KIND, owner, repo, work),
    ])
      .then(([remote, local]) => {
        if (cancelled) return;
        shaRef.current = remote.sha;
        setCommitted(JSON.stringify(remote.struttura));
        setDoc(remote.struttura);
        if (local && JSON.stringify(local.data) !== JSON.stringify(remote.struttura)) {
          if (local.baseSha === remote.sha) {
            setDoc(local.data);
            setNotice({ kind: "info", text: "Ho ripreso le modifiche alla struttura salvate in questo browser, non ancora salvate in versione." });
          } else {
            setConflict(local);
          }
        }
        setLoaded(true);
      })
      .catch((err: ClientApiError) => !cancelled && setLoadError(err));
    return () => {
      cancelled = true;
    };
  }, [base, work, owner, repo]);

  // Copia locale a ogni modifica (la versione su GitHub resta un gesto volontario).
  useEffect(() => {
    if (!loaded || conflict) return;
    const t = setTimeout(() => {
      if (dirty && doc) void saveLocalCopy(LOCAL_KIND, owner, repo, work, { data: doc, baseSha: shaRef.current, updatedAt: Date.now() });
      else void clearLocalCopy(LOCAL_KIND, owner, repo, work);
    }, 300);
    return () => clearTimeout(t);
  }, [doc, dirty, loaded, conflict, owner, repo, work]);

  const workInfo = project.data?.opere.find((o) => o.slug === work);
  const capitoli = useMemo(() => workInfo?.capitoli ?? [], [workInfo]);
  const effectiveGoal = goal ?? workInfo?.obiettivoParole ?? 80000;
  /**
   * Da dove partono le battute quando si passa a «battute esatte»: dall'obiettivo
   * dell'opera se c'è, altrimenti 10.000 per un racconto (misura tipica dei
   * concorsi) e la stima dell'obiettivo in parole per un romanzo.
   */
  const startBattute =
    goal === null && !workInfo?.obiettivoParole && project.data?.manifest.tipo === "racconto" ? 10_000 : battuteFromWords(effectiveGoal);

  const chapterWords = useMemo(() => new Map((stats.data?.capitoli ?? []).map((c) => [c.file, c])), [stats.data]);
  const measure = doc ? measureOf(doc) : "percentuale";
  /**
   * Quanto è già scritto di ogni scena: parole (o battute, se le sezioni si
   * misurano in battute) del capitolo divise tra le sue scene.
   */
  const sceneWords = useMemo(() => {
    const perChapter = new Map<string, number>();
    for (const s of doc?.scene ?? []) if (s.capitolo) perChapter.set(s.capitolo, (perChapter.get(s.capitolo) ?? 0) + 1);
    const out = new Map<string, number>();
    for (const s of doc?.scene ?? []) {
      if (!s.capitolo) continue;
      const st = chapterWords.get(s.capitolo);
      const amount = (measure === "battute" ? st?.battute : st?.parole) ?? 0;
      out.set(s.id, Math.round(amount / (perChapter.get(s.capitolo) ?? 1)));
    }
    return out;
  }, [doc, chapterWords, measure]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of sheets.data?.personaggi ?? []) m.set(c.data.id, c.data.nome);
    for (const v of sheets.data?.voci ?? []) m.set(v.data.id, v.data.nome);
    return m;
  }, [sheets.data]);

  const update = useCallback((next: WorkStructure) => setDoc(next), []);

  function upsertScene(scene: Scene) {
    if (!doc) return;
    const exists = doc.scene.some((s) => s.id === scene.id);
    let scenes = exists ? doc.scene.map((s) => (s.id === scene.id ? scene : s)) : [...doc.scene, scene];
    // Cambio di sezione dall'editor: la scena va in coda alla nuova sezione.
    const before = doc.scene.find((s) => s.id === scene.id);
    if (before && before.sezione !== scene.sezione) scenes = moveScene(scenes, scene.id, scene.sezione, Number.MAX_SAFE_INTEGER);
    update({ ...doc, scene: scenes });
    setEditing(null);
  }

  function deleteScene(id: string) {
    if (!doc) return;
    update({ ...doc, scene: doc.scene.filter((s) => s.id !== id) });
    setEditing(null);
  }

  function nudge(scene: Scene, dir: -1 | 1) {
    if (!doc) return;
    const list = scenesIn(doc.scene, scene.sezione);
    const i = list.findIndex((s) => s.id === scene.id);
    if (i + dir < 0 || i + dir >= list.length) return;
    update({ ...doc, scene: moveScene(doc.scene, scene.id, scene.sezione, dir === -1 ? i - 1 : i + 1) });
  }

  function onDrop(e: DragEvent, section: string | null, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const id = dragged.current ?? e.dataTransfer.getData("text/plain");
    dragged.current = null;
    if (!doc || !id) return;
    // Dentro la stessa sezione, l'indice di destinazione va calcolato senza la scena spostata.
    const list = scenesIn(doc.scene, section);
    const from = list.findIndex((s) => s.id === id);
    const target = from >= 0 && from < index ? index - 1 : index;
    update({ ...doc, scene: moveScene(doc.scene, id, section, target) });
  }

  async function saveVersion(message: string): Promise<string | null> {
    if (!doc) return "Niente da salvare.";
    try {
      const res = await api<{ sha: string; struttura: WorkStructure }>(`${base}/opere/${work}/struttura`, {
        method: "PUT",
        json: { sha: shaRef.current, struttura: doc, message },
      });
      shaRef.current = res.sha;
      setDoc(res.struttura);
      setCommitted(JSON.stringify(res.struttura));
      setConflict(null);
      await clearLocalCopy(LOCAL_KIND, owner, repo, work);
      setNotice({ kind: "ok", text: "Struttura e scene salvate su GitHub." });
      return null;
    } catch (err) {
      const e = err as ClientApiError;
      return e.status === 409
        ? "La struttura è stata modificata su GitHub dopo che l'hai aperta. Le tue modifiche restano in questo browser: ricarica la pagina per confrontarle."
        : e.message;
    }
  }

  function chooseTemplate(t: StructureTemplate) {
    const next = applyTemplate(doc, t);
    const lost = doc ? doc.scene.filter((s) => s.sezione).length - next.scene.filter((s) => s.sezione).length : 0;
    if (lost > 0 && !window.confirm(`${lost} scene non trovano una sezione corrispondente in «${t.nome}» e andranno in «Non assegnate». Continuare?`)) return;
    update(next);
    setDialog(null);
    setNotice({ kind: "warn", text: `Struttura «${t.nome}» applicata. Salva la struttura per confermarla su GitHub.` });
  }

  const title = project.data?.manifest.titolo ?? "Progetto";
  const nav = <ProjectNav owner={owner} repo={repo} title={title} current="struttura" subtitle={workInfo ? `Opera: ${workInfo.titolo}` : undefined} />;

  if (loadError || project.error) {
    const err = loadError ?? project.error!;
    return (
      <main className="page">
        {nav}
        <div className="notice notice-error" role="alert">
          {err.message}
        </div>
      </main>
    );
  }
  if (!loaded || !project.data) {
    return (
      <main className="page">
        {nav}
        <p className="muted">Carico struttura e scene…</p>
      </main>
    );
  }

  const header = (
    <div className="page-head">
      <div>
        <h1>Struttura e scene</h1>
        <div className="small muted">
          {workInfo?.titolo}
          {doc ? ` · modello: ${doc.modello.nome} · ${doc.scene.length} ${doc.scene.length === 1 ? "scena" : "scene"}` : ""}
        </div>
      </div>
      {doc && (
        <div className="row">
          <span className="small muted row" style={{ gap: 6 }} aria-live="polite">
            <span className={`status-dot ${dirty ? "dirty" : "clean"}`} aria-hidden="true" />
            {dirty ? "Modifiche non ancora in versione" : "Tutto salvato in versione"}
          </span>
          <button type="button" className="btn" onClick={() => setDialog("modello")}>
            Cambia modello
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog("salva")} disabled={!dirty}>
            Salva struttura
          </button>
        </div>
      )}
    </div>
  );

  return (
    <main className="page page-wide">
      {nav}
      {header}

      {conflict && (
        <div className="notice notice-warn" role="alert">
          In questo browser ci sono modifiche alla struttura partite da una versione precedente: nel frattempo il file è cambiato su GitHub. Adesso vedi la versione di GitHub.
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setDoc(conflict.data);
                setConflict(null);
              }}
            >
              Usa le mie modifiche locali
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={async () => {
                await clearLocalCopy(LOCAL_KIND, owner, repo, work);
                setConflict(null);
              }}
            >
              Scarta le modifiche locali
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className={`notice ${notice.kind === "info" ? "" : `notice-${notice.kind}`}`} role="status">
          {notice.text}{" "}
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setNotice(null)}>
            Chiudi
          </button>
        </div>
      )}
      {sheets.data?.errori.length ? (
        <div className="notice notice-warn">Alcune schede non sono leggibili: le trovi segnalate nelle pagine Personaggi e Mondo.</div>
      ) : null}

      {!doc ? (
        <TemplateChooser onChoose={chooseTemplate} />
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Viste della struttura">
            {(
              [
                ["bacheca", "Bacheca delle scene"],
                ["insieme", "Vista d'insieme"],
                ["sezioni", "Atti e sezioni"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "bacheca" && (
            <Board
              doc={doc}
              names={names}
              capitoli={capitoli}
              sceneWords={sceneWords}
              {...sectionTargets(doc, effectiveGoal)}
              onOpen={(scene) => setEditing({ scene, isNew: false })}
              onAdd={(section) => setEditing({ scene: newScene(section), isNew: true })}
              onNudge={nudge}
              onDragStart={(id) => (dragged.current = id)}
              onDrop={onDrop}
            />
          )}

          {tab === "insieme" && (
            <Overview
              doc={doc}
              names={names}
              capitoli={capitoli}
              stats={stats.data?.capitoli ?? null}
              statsError={stats.error?.message ?? null}
              sceneWords={sceneWords}
              goal={effectiveGoal}
              onGoal={setGoal}
              onOpen={(scene) => setEditing({ scene, isNew: false })}
              chapterHref={(file) => `/progetto/${owner}/${repo}/${work}/${file.replace(/\.md$/, "")}`}
            />
          )}

          {tab === "sezioni" && (
            <section className="card stack">
              <p className="small muted" style={{ margin: 0 }}>
                Questa è la copia della struttura usata da quest&apos;opera: modificarla non cambia le strutture della libreria. Eliminando una sezione, le sue scene vanno in «Non assegnate».
              </p>
              <ActsEditor
                atti={doc.atti}
                misura={measure}
                onMeasure={(m) => update(changeMeasure(doc, m, startBattute))}
                goal={effectiveGoal}
                onChange={(atti) => update(withValidSections(doc, atti))}
                countFor={(id) => doc.scene.filter((s) => s.sezione === id).length}
              />
            </section>
          )}
        </>
      )}

      <SceneEditor
        scene={editing?.scene ?? null}
        isNew={editing?.isNew ?? false}
        atti={doc?.atti ?? []}
        capitoli={capitoli}
        sheets={sheets.data}
        onSave={upsertScene}
        onDelete={deleteScene}
        onClose={() => setEditing(null)}
      />
      <SaveDialog
        open={dialog === "salva"}
        onClose={() => setDialog(null)}
        title="Salva struttura"
        defaultMessage={`${workInfo?.titolo ?? work}: struttura e scene`}
        onSave={saveVersion}
      />
      <Modal open={dialog === "modello"} onClose={() => setDialog(null)} title="Cambia modello" wide>
        <p className="small muted" style={{ marginTop: 0 }}>
          Le scene restano: quelle di sezioni che non esistono nel nuovo modello vanno in «Non assegnate».
        </p>
        <TemplateChooser onChoose={chooseTemplate} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => setDialog(null)}>
            Chiudi
          </button>
        </div>
      </Modal>
    </main>
  );
}

function TemplateChooser({ onChoose }: { onChoose: (t: StructureTemplate) => void }) {
  const lib = useApiData<LibraryData>("/api/strutture");
  if (lib.error) return <div className="notice notice-error">{lib.error.message}</div>;
  if (!lib.data) return <p className="muted">Carico le strutture…</p>;
  const all = [...lib.data.predefinite.map((t) => ({ t, mine: false })), ...lib.data.personali.map((p) => ({ t: p.struttura, mine: true }))];
  return (
    <section className="stack" aria-label="Scegli un modello narrativo">
      <p style={{ margin: 0 }}>Scegli il modello narrativo dell&apos;opera. Potrai modificarne atti e sezioni, o cambiarlo in seguito.</p>
      <div className="grid-cards">
        {all.map(({ t, mine }) => (
          <div key={`${mine}-${t.id}`} className="card stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong className="serif" style={{ fontSize: 18 }}>
                {t.nome}
              </strong>
              <span className="badge">{mine ? "Mia" : "Predefinita"}</span>
            </div>
            <span className="small muted">{t.descrizione || `${allSections(t.atti).length} sezioni`}</span>
            <span className="small muted">
              {t.atti.length} {t.atti.length === 1 ? "atto" : "atti"} · {allSections(t.atti).length} sezioni
              {measureOf(t) === "battute"
                ? ` · ${formatCount(totalBattute(t.atti))} battute`
                : totalWeight(t.atti) !== 100 && allSections(t.atti).length > 0
                  ? ` · pesi ${totalWeight(t.atti)}%`
                  : ""}
            </span>
            <button type="button" className="btn btn-small" style={{ alignSelf: "flex-start" }} onClick={() => onChoose(t)}>
              Usa «{t.nome}»
            </button>
          </div>
        ))}
      </div>
      <Link href="/strutture" className="small">
        Gestisci le strutture della libreria →
      </Link>
    </section>
  );
}

function SceneCard({
  scene,
  names,
  chapterTitle,
  words,
  unit,
  first,
  last,
  onOpen,
  onNudge,
  onDragStart,
  onDrop,
}: {
  scene: Scene;
  names: Map<string, string>;
  chapterTitle: string | null;
  words: number | undefined;
  unit: "parole" | "battute";
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onNudge: (dir: -1 | 1) => void;
  onDragStart: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  return (
    <li
      className="scene-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", scene.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <button type="button" className="scene-open" onClick={onOpen}>
        <span className="scene-title">{scene.titolo}</span>
        <span className="scene-meta">
          <span className={`pill pill-${scene.stato}`}>{SCENE_STATUS_LABEL[scene.stato]}</span>
          {scene.pov && <span>POV {names.get(scene.pov) ?? "(eliminato)"}</span>}
        </span>
        <span className="small muted">
          {chapterTitle ? `${chapterTitle}${words ? ` · ≈ ${formatCount(words)} ${unit}` : ""}` : "Non ancora in un capitolo"}
        </span>
      </button>
      <span className="scene-move">
        <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta su ${scene.titolo}`} disabled={first} onClick={() => onNudge(-1)}>
          ↑
        </button>
        <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta giù ${scene.titolo}`} disabled={last} onClick={() => onNudge(1)}>
          ↓
        </button>
      </span>
    </li>
  );
}

function Board({
  doc,
  names,
  capitoli,
  sceneWords,
  targets,
  unit,
  onOpen,
  onAdd,
  onNudge,
  onDragStart,
  onDrop,
}: {
  doc: WorkStructure;
  names: Map<string, string>;
  capitoli: { file: string; titolo: string }[];
  sceneWords: Map<string, number>;
  targets: Map<string, number>;
  unit: "parole" | "battute";
  onOpen: (s: Scene) => void;
  onAdd: (section: string | null) => void;
  onNudge: (s: Scene, dir: -1 | 1) => void;
  onDragStart: (id: string) => void;
  onDrop: (e: DragEvent, section: string | null, index: number) => void;
}) {
  const titleOf = (file: string | null) => (file ? (capitoli.find((c) => c.file === file)?.titolo ?? file) : null);

  const column = (id: string | null, label: string, guide: string, extra: string) => {
    const list = scenesIn(doc.scene, id);
    const written = list.reduce((sum, s) => sum + (sceneWords.get(s.id) ?? 0), 0);
    return (
      <section
        key={id ?? "_none"}
        className={`board-col${id === null ? " board-col-none" : ""}${list.length === 0 && id ? " is-empty" : ""}`}
        aria-label={label}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, id, list.length)}
      >
        <header className="board-col-head">
          <h3>{label}</h3>
          <span className="small muted">
            {extra}
            {id && `${extra ? " · " : ""}${formatCount(written)} / ${formatCount(targets.get(id) ?? 0)} ${unit}`}
          </span>
          {guide && <p className="board-guide">{guide}</p>}
          {id && list.length === 0 && <span className="small warn-text">Sezione scoperta</span>}
        </header>
        <ol className="scene-list">
          {list.map((s, i) => (
            <SceneCard
              key={s.id}
              scene={s}
              names={names}
              chapterTitle={titleOf(s.capitolo)}
              words={sceneWords.get(s.id)}
              unit={unit}
              first={i === 0}
              last={i === list.length - 1}
              onOpen={() => onOpen(s)}
              onNudge={(dir) => onNudge(s, dir)}
              onDragStart={() => onDragStart(s.id)}
              onDrop={(e) => onDrop(e, id, i)}
            />
          ))}
        </ol>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => onAdd(id)}>
          + Scena
        </button>
      </section>
    );
  };

  const unassigned = scenesIn(doc.scene, null);
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Trascina le scene tra le sezioni (oppure usa ↑ ↓ e il campo «Sezione» nella scheda della scena). {unit === "battute" ? "Le battute (con spazi)" : "Le parole"} sono quelle dei capitoli salvati, divise tra le scene di ciascun capitolo.
      </p>
      {(unassigned.length > 0 || allSections(doc.atti).length === 0) && (
        <div className="board">{column(null, "Non assegnate", "Scene che non appartengono ancora a una sezione.", `${unassigned.length} scene`)}</div>
      )}
      {doc.atti.map((a, i) => (
        <div key={a.id} className="board-act">
          <h2 className={`board-act-title act-text-${i % 4}`}>{a.nome}</h2>
          {a.sezioni.length === 0 && <p className="small muted">Nessuna sezione: aggiungile in «Atti e sezioni».</p>}
          <div className="board">{a.sezioni.map((s) => column(s.id, s.nome, s.guida, unit === "battute" ? "" : `${s.peso}%`))}</div>
        </div>
      ))}
    </div>
  );
}

function Overview({
  doc,
  names,
  capitoli,
  stats,
  statsError,
  sceneWords,
  goal,
  onGoal,
  onOpen,
  chapterHref,
}: {
  doc: WorkStructure;
  names: Map<string, string>;
  capitoli: { file: string; titolo: string }[];
  stats: ChapterStats[] | null;
  statsError: string | null;
  sceneWords: Map<string, number>;
  goal: number;
  onGoal: (n: number) => void;
  onOpen: (s: Scene) => void;
  chapterHref: (file: string) => string;
}) {
  const { unit, targets } = sectionTargets(doc, goal);
  const byBattute = unit === "battute";
  const totals = (stats ?? []).reduce(
    (t, c) => ({ parole: t.parole + c.parole, battute: t.battute + c.battute, battuteSenzaSpazi: t.battuteSenzaSpazi + c.battuteSenzaSpazi }),
    { parole: 0, battute: 0, battuteSenzaSpazi: 0 },
  );
  const sectionName = new Map(allSections(doc.atti).map((s) => [s.id, s.nome]));
  const scenesByChapter = (file: string) => doc.scene.filter((s) => s.capitolo === file);

  return (
    <div className="stack">
      <section className="card">
        <h2 className="h2">Opera</h2>
        {statsError && <div className="notice notice-error">{statsError}</div>}
        <dl className="stats stats-inline">
          <div>
            <dt>Parole</dt>
            <dd>{stats ? formatCount(totals.parole) : "…"}</dd>
          </div>
          <div>
            <dt>Battute con spazi</dt>
            <dd>{stats ? formatCount(totals.battute) : "…"}</dd>
          </div>
          <div>
            <dt>senza spazi</dt>
            <dd>{stats ? formatCount(totals.battuteSenzaSpazi) : "…"}</dd>
          </div>
          {byBattute ? (
            <div>
              <dt>Obiettivo battute</dt>
              <dd>
                {formatCount(totalBattute(doc.atti))}
                {stats && (
                  <span className={`small ${totals.battute > totalBattute(doc.atti) ? "warn-text" : "muted"}`}>
                    {" "}
                    ·{" "}
                    {totals.battute > totalBattute(doc.atti)
                      ? `oltre di ${formatCount(totals.battute - totalBattute(doc.atti))}`
                      : `ne mancano ${formatCount(totalBattute(doc.atti) - totals.battute)}`}
                  </span>
                )}
              </dd>
            </div>
          ) : (
            <div>
              <dt>
                <label htmlFor="ov-goal">Obiettivo parole</label>
              </dt>
              <dd>
                <input id="ov-goal" type="number" className="input" style={{ width: 120 }} min={1000} step={1000} value={goal} onChange={(e) => onGoal(Math.max(0, Number(e.target.value) || 0))} />
              </dd>
            </div>
          )}
        </dl>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Conteggi sull&apos;ultima versione salvata di ogni capitolo.{" "}
          {byBattute ? "L'obiettivo è la somma delle battute delle sezioni (in «Atti e sezioni»)." : "L'obiettivo serve solo alle stime di questa pagina."}
        </p>
      </section>

      <section className="card table-card">
        <h2 className="h2">Sezioni</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Sezione</th>
                <th scope="col">{byBattute ? "Battute previste" : "Peso"}</th>
                <th scope="col">Scene</th>
                <th scope="col">In un capitolo</th>
                <th scope="col">{byBattute ? "Battute scritte / previste" : "Parole / obiettivo"}</th>
                <th scope="col">Avvisi</th>
              </tr>
            </thead>
            <tbody>
              {doc.atti.map((a) => [
                <tr key={a.id} className="table-group">
                  <th colSpan={6} scope="colgroup">
                    {a.nome}
                  </th>
                </tr>,
                ...a.sezioni.map((s) => {
                  const list = scenesIn(doc.scene, s.id);
                  const words = list.reduce((sum, x) => sum + (sceneWords.get(x.id) ?? 0), 0);
                  const target = targets.get(s.id) ?? 0;
                  const warn =
                    list.length === 0
                      ? "Scoperta"
                      : byBattute
                        ? target > 0 && words > target
                          ? `Oltre di ${formatCount(words - target)} battute`
                          : ""
                        : target > 0 && words > target * 1.5
                          ? "Più lunga del previsto"
                          : "";
                  return (
                    <tr key={s.id}>
                      <td>{s.nome}</td>
                      <td>{byBattute ? formatCount(s.battute ?? 0) : `${s.peso}%`}</td>
                      <td>{list.length}</td>
                      <td>{list.filter((x) => x.capitolo).length}</td>
                      <td>
                        {formatCount(words)} / {formatCount(target)}
                      </td>
                      <td className={warn ? "warn-text" : "muted"}>{warn || "—"}</td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card table-card">
        <h2 className="h2">Capitoli</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Capitolo</th>
                <th scope="col">Stato</th>
                <th scope="col">Scene</th>
                <th scope="col">Parole</th>
                <th scope="col">Battute</th>
                <th scope="col">Senza spazi</th>
              </tr>
            </thead>
            <tbody>
              {capitoli.map((c, i) => {
                const st = stats?.find((x) => x.file === c.file);
                const sc = scenesByChapter(c.file);
                return (
                  <tr key={c.file}>
                    <td>{i + 1}</td>
                    <td>
                      <Link href={chapterHref(c.file)}>{c.titolo}</Link>
                    </td>
                    <td>{st?.stato ?? "…"}</td>
                    <td>{sc.length ? sc.map((x) => x.titolo).join(", ") : <span className="warn-text">nessuna</span>}</td>
                    <td>{st ? formatCount(st.parole) : "…"}</td>
                    <td>{st ? formatCount(st.battute) : "…"}</td>
                    <td>{st ? formatCount(st.battuteSenzaSpazi) : "…"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card table-card">
        <h2 className="h2">Scene</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Scena</th>
                <th scope="col">Sezione</th>
                <th scope="col">Stato</th>
                <th scope="col">Capitolo</th>
                <th scope="col">POV</th>
                <th scope="col">Luogo</th>
              </tr>
            </thead>
            <tbody>
              {doc.scene.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Nessuna scena: aggiungile dalla bacheca.
                  </td>
                </tr>
              )}
              {doc.scene.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button type="button" className="link-button" onClick={() => onOpen(s)}>
                      {s.titolo}
                    </button>
                  </td>
                  <td>{s.sezione ? (sectionName.get(s.sezione) ?? "—") : <span className="warn-text">Non assegnata</span>}</td>
                  <td>
                    <span className={`pill pill-${s.stato}`}>{SCENE_STATUS_LABEL[s.stato]}</span>
                  </td>
                  <td>{s.capitolo ? (capitoli.find((c) => c.file === s.capitolo)?.titolo ?? s.capitolo) : "—"}</td>
                  <td>{s.pov ? (names.get(s.pov) ?? "(eliminato)") : "—"}</td>
                  <td>{s.luogo ? (names.get(s.luogo) ?? "(eliminato)") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
