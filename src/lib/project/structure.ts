import YAML from "yaml";
import { FormatError, parseYaml } from "./format";
import { LONG, SHORT, compact, idList, idOrNull, isId, list, oneOf, record, requiredText, text } from "./normalize";

/**
 * Strutture narrative e scene.
 *
 * Una *struttura* (modello) è un elenco di atti, ciascuno con le sue sezioni
 * (beat/tappe) con guida e peso percentuale. Le predefinite sono nel codice, le
 * personali in `strutture/<id>.yaml` nel repository `writly-libreria` dell'autore.
 *
 * Ogni opera ha la propria copia in `opere/<opera>/struttura.yaml`, insieme alle
 * scene: modificare la struttura di libreria non cambia le opere già avviate, e
 * il repository del progetto resta autosufficiente.
 */

export interface StructureSection {
  id: string;
  nome: string;
  guida: string;
  /** Peso indicativo sul totale del libro, in percentuale. */
  peso: number;
}

export interface StructureAct {
  id: string;
  nome: string;
  sezioni: StructureSection[];
}

export interface StructureTemplate {
  id: string;
  nome: string;
  descrizione: string;
  /** Nome della struttura da cui è stata clonata, se c'è. */
  origine: string;
  atti: StructureAct[];
}

export const SCENE_STATUSES = ["idea", "pianificata", "in-stesura", "scritta", "revisionata"] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  idea: "Idea",
  pianificata: "Pianificata",
  "in-stesura": "In stesura",
  scritta: "Scritta",
  revisionata: "Revisionata",
};

export interface Scene {
  id: string;
  titolo: string;
  /** Sezione della struttura; null = «Non assegnate». */
  sezione: string | null;
  /** File del capitolo che la realizza (es. "capitolo-1.md"); null = non ancora scritta. */
  capitolo: string | null;
  stato: SceneStatus;
  sinossi: string;
  obiettivo: string;
  conflitto: string;
  esito: string;
  /** Personaggio dal cui punto di vista è narrata. */
  pov: string | null;
  /** Voce del mondo (di solito un luogo). */
  luogo: string | null;
  /** Momento della storia in cui accade (testo libero: "la notte dopo il naufragio"). */
  quando: string;
  personaggi: string[];
}

export interface WorkStructure {
  modello: { id: string; nome: string };
  atti: StructureAct[];
  /** Ordine dell'elenco = ordine delle scene dentro ogni sezione. */
  scene: Scene[];
}

const CHAPTER_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

function normalizeActs(value: unknown, what: string): StructureAct[] {
  const seen = new Set<string>();
  const unique = (id: unknown, label: string) => {
    if (!isId(id)) throw new FormatError(`${label}: «id» mancante o non valido`);
    if (seen.has(id)) throw new FormatError(`${label}: id «${id}» ripetuto`);
    seen.add(id);
    return id;
  };
  return list(value, `${what}, atti`, 50).map((a, i) => {
    const act = record(a, `${what}, atto ${i + 1}`);
    const label = `${what}, atto ${i + 1}`;
    return {
      id: unique(act.id, label),
      nome: requiredText(act, "nome", label),
      sezioni: list(act.sezioni, `${label}, sezioni`, 100).map((s, j) => {
        const sec = record(s, `${label}, sezione ${j + 1}`);
        const slabel = `${label}, sezione ${j + 1}`;
        const peso = sec.peso === undefined ? 0 : Number(sec.peso);
        if (!Number.isFinite(peso) || peso < 0 || peso > 100) throw new FormatError(`${slabel}: «peso» deve essere tra 0 e 100`);
        return {
          id: unique(sec.id, slabel),
          nome: requiredText(sec, "nome", slabel),
          guida: text(sec, "guida", slabel, 4000),
          peso: Math.round(peso * 10) / 10,
        };
      }),
    };
  });
}

export function normalizeTemplate(value: unknown, what = "struttura"): StructureTemplate {
  const obj = record(value, what);
  return {
    id: isId(obj.id) ? obj.id : "",
    nome: requiredText(obj, "nome", what),
    descrizione: text(obj, "descrizione", what, 4000),
    origine: text(obj, "origine", what),
    atti: normalizeActs(obj.atti, what),
  };
}

export function normalizeScene(value: unknown, what = "scena"): Scene {
  const obj = record(value, what);
  if (!isId(obj.id)) throw new FormatError(`${what}: «id» mancante o non valido`);
  const capitolo = obj.capitolo;
  if (capitolo !== undefined && capitolo !== null && capitolo !== "" && (typeof capitolo !== "string" || !CHAPTER_FILE.test(capitolo))) {
    throw new FormatError(`${what}: «capitolo» non valido`);
  }
  return {
    id: obj.id,
    titolo: requiredText(obj, "titolo", what),
    sezione: idOrNull(obj, "sezione", what),
    capitolo: typeof capitolo === "string" && capitolo ? capitolo : null,
    stato: oneOf(obj.stato, SCENE_STATUSES, "idea"),
    sinossi: text(obj, "sinossi", what, LONG),
    obiettivo: text(obj, "obiettivo", what, 4000),
    conflitto: text(obj, "conflitto", what, 4000),
    esito: text(obj, "esito", what, 4000),
    pov: idOrNull(obj, "pov", what),
    luogo: idOrNull(obj, "luogo", what),
    quando: text(obj, "quando", what, SHORT),
    personaggi: idList(obj.personaggi, `${what}, personaggi`),
  };
}

export function normalizeWorkStructure(value: unknown, what = "struttura.yaml"): WorkStructure {
  const obj = record(value, what);
  const modello = record(obj.modello, `${what}, modello`);
  const atti = normalizeActs(obj.atti, what);
  const sections = new Set(atti.flatMap((a) => a.sezioni.map((s) => s.id)));
  const ids = new Set<string>();
  const scene = list(obj.scene, `${what}, scene`, 5000).map((s, i) => {
    const scene = normalizeScene(s, `${what}, scena ${i + 1}`);
    if (ids.has(scene.id)) throw new FormatError(`${what}: scena con id «${scene.id}» ripetuto`);
    ids.add(scene.id);
    // Sezione eliminata (anche a mano): la scena non si perde, va in «Non assegnate».
    return scene.sezione && !sections.has(scene.sezione) ? { ...scene, sezione: null } : scene;
  });
  return {
    modello: { id: text(modello, "id", what), nome: text(modello, "nome", what) || "Libero" },
    atti,
    scene,
  };
}

export function parseTemplate(text: string, id: string): StructureTemplate {
  return { ...normalizeTemplate(parseYaml(text, `strutture/${id}.yaml`), `strutture/${id}.yaml`), id };
}

export function serializeTemplate(t: StructureTemplate): string {
  return YAML.stringify(
    compact({ nome: t.nome, descrizione: t.descrizione, origine: t.origine, atti: t.atti.map(serializeAct) }),
  );
}

function serializeAct(a: StructureAct) {
  return {
    id: a.id,
    nome: a.nome,
    sezioni: a.sezioni.map((s) => compact({ id: s.id, nome: s.nome, guida: s.guida, peso: s.peso })),
  };
}

export function parseWorkStructure(text: string, work: string): WorkStructure {
  const what = `opere/${work}/struttura.yaml`;
  return normalizeWorkStructure(parseYaml(text, what), what);
}

export function serializeWorkStructure(s: WorkStructure): string {
  return YAML.stringify({
    modello: s.modello,
    atti: s.atti.map(serializeAct),
    scene: s.scene.map((sc) =>
      compact({
        id: sc.id,
        titolo: sc.titolo,
        sezione: sc.sezione,
        capitolo: sc.capitolo,
        stato: sc.stato,
        pov: sc.pov,
        luogo: sc.luogo,
        quando: sc.quando,
        personaggi: sc.personaggi,
        sinossi: sc.sinossi,
        obiettivo: sc.obiettivo,
        conflitto: sc.conflitto,
        esito: sc.esito,
      }),
    ),
  });
}

// ——— Operazioni sulle strutture ———

export function allSections(atti: StructureAct[]): StructureSection[] {
  return atti.flatMap((a) => a.sezioni);
}

export function totalWeight(atti: StructureAct[]): number {
  return Math.round(allSections(atti).reduce((sum, s) => sum + s.peso, 0) * 10) / 10;
}

/**
 * Riporta i pesi a 100 mantenendo le proporzioni (numeri interi, metodo dei
 * resti maggiori). Se tutti i pesi sono zero li divide in parti uguali.
 */
export function rebalance(atti: StructureAct[]): StructureAct[] {
  const sections = allSections(atti);
  if (sections.length === 0) return atti;
  const total = sections.reduce((sum, s) => sum + s.peso, 0);
  const raw = sections.map((s) => (total > 0 ? (s.peso / total) * 100 : 100 / sections.length));
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  const byId = new Map(sections.map((s, i) => [s.id, floors[i]]));
  return atti.map((a) => ({ ...a, sezioni: a.sezioni.map((s) => ({ ...s, peso: byId.get(s.id) ?? s.peso })) }));
}

/** Parole indicative per sezione dato l'obiettivo del libro. */
export function wordTargets(atti: StructureAct[], goal: number): Map<string, number> {
  const total = totalWeight(atti);
  const out = new Map<string, number>();
  for (const s of allSections(atti)) out.set(s.id, total > 0 ? Math.round((goal * s.peso) / total) : 0);
  return out;
}

/** Applica (o cambia) il modello di un'opera: le scene restano, quelle di sezioni che non esistono più vanno in «Non assegnate». */
export function applyTemplate(current: WorkStructure | null, template: StructureTemplate): WorkStructure {
  const atti = template.atti.map((a) => ({ ...a, sezioni: a.sezioni.map((s) => ({ ...s })) }));
  const sections = new Set(allSections(atti).map((s) => s.id));
  return {
    modello: { id: template.id, nome: template.nome },
    atti,
    scene: (current?.scene ?? []).map((s) => (s.sezione && !sections.has(s.sezione) ? { ...s, sezione: null } : s)),
  };
}

/** Elimina una sezione: le sue scene vanno in «Non assegnate». */
export function removeSection(structure: WorkStructure, sectionId: string): WorkStructure {
  return {
    ...structure,
    atti: structure.atti.map((a) => ({ ...a, sezioni: a.sezioni.filter((s) => s.id !== sectionId) })),
    scene: structure.scene.map((s) => (s.sezione === sectionId ? { ...s, sezione: null } : s)),
  };
}

/** Elimina un atto con le sue sezioni; le scene vanno in «Non assegnate». */
export function removeAct(structure: WorkStructure, actId: string): WorkStructure {
  const act = structure.atti.find((a) => a.id === actId);
  if (!act) return structure;
  const gone = new Set(act.sezioni.map((s) => s.id));
  return {
    ...structure,
    atti: structure.atti.filter((a) => a.id !== actId),
    scene: structure.scene.map((s) => (s.sezione && gone.has(s.sezione) ? { ...s, sezione: null } : s)),
  };
}

export function scenesIn(scenes: Scene[], sectionId: string | null): Scene[] {
  return scenes.filter((s) => s.sezione === sectionId);
}

/**
 * Sposta una scena nella sezione `to` (null = non assegnate) alla posizione
 * `index` fra le scene di quella sezione (oltre la fine = in coda).
 */
export function moveScene(scenes: Scene[], sceneId: string, to: string | null, index: number): Scene[] {
  const scene = scenes.find((s) => s.id === sceneId);
  if (!scene) return scenes;
  const rest = scenes.filter((s) => s.id !== sceneId);
  const moved = { ...scene, sezione: to };
  const target = rest.filter((s) => s.sezione === to);
  if (index < target.length) {
    const at = rest.indexOf(target[Math.max(0, index)]);
    return [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  if (target.length > 0) {
    const at = rest.indexOf(target[target.length - 1]) + 1;
    return [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  return [...rest, moved];
}

/** Sposta un elemento in un elenco (riordino di atti e sezioni). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const out = [...items];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
