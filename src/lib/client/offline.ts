import { del, get, keys, set } from "idb-keyval";
import { chapterPath } from "@/lib/project/paths";
import type { ProjectData } from "@/lib/server/projects";
import { loadItalianSpellChecker } from "@/lib/spell/checker";
import { api, ClientApiError, projectApi } from "./api";
import { DATA_PREFIX, deleteOfflineJson, storeOfflineJson } from "./offline-data";
import type { SheetsData } from "@/lib/server/sheets";

/**
 * «Scarica per il viaggio»: una copia del progetto nel dispositivo (IndexedDB) e le
 * pagine nella cache del service worker, per aprire e scrivere i capitoli senza rete.
 * Le modifiche fatte offline restano bozze locali (vedi drafts.ts) e tornano su GitHub
 * quando l'autore salva con la rete: se il capitolo nel frattempo è cambiato, l'editor
 * propone l'unione, come per ogni altro conflitto.
 *
 * I capitoli (versione principale) si possono scrivere. Schede, struttura, panoramica,
 * commenti e appunti si consultano soltanto: le loro risposte sono salvate in
 * offline-data.ts e `api()` le usa quando la rete manca. Varianti ed esportazione
 * richiedono la rete.
 */

export interface TravelInfo {
  scaricatoIl: number;
  project: ProjectData;
  /** Percorsi dei capitoli scaricati, in ordine. */
  capitoli: string[];
  /** Indirizzi delle API di lettura salvate con la copia (assente nelle copie del primo passo). */
  dati?: string[];
}

export interface PackedFile {
  text: string;
  sha: string;
}

export interface DownloadProgress {
  fatto: number;
  totale: number;
  passo: string;
}

const PREFIX = "writly:viaggio:";
const infoKey = (owner: string, repo: string) => `${PREFIX}${owner}/${repo}`;
const fileKey = (owner: string, repo: string, path: string) => `${PREFIX}file:${owner}/${repo}/${path}`;

/** Indirizzi dei file di build (script, stili, wasm) citati da una pagina, anche nei dati RSC dove sono senza `/_next/`. */
export function extractAssetUrls(html: string): string[] {
  const found = new Set<string>();
  const re = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s<>()]+?\.(?:js|css|wasm|woff2?)/g;
  for (const m of html.matchAll(re)) found.add(m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`);
  return [...found];
}

/** Indirizzi delle pagine da tenere pronte: libreria, progetto, sezioni consultabili e un capitolo per volta. */
export function pagesToCache(owner: string, repo: string, project: ProjectData): string[] {
  const root = `/progetto/${owner}/${repo}`;
  const pages = ["/", "/appunti", "/strutture", root, `${root}/personaggi`, `${root}/mondo`, `${root}/appunti`, `${root}/panoramica`];
  for (const work of project.opere) pages.push(`${root}/struttura/${work.slug}`);
  for (const work of project.opere) for (const c of work.capitoli) pages.push(`${root}/${work.slug}/${c.file.replace(/\.md$/, "")}`);
  return pages;
}

/** Indirizzo dei commenti di un capitolo, come lo chiede l'editor (versione principale). */
export function commentsUrl(owner: string, repo: string, work: string, file: string): string {
  return `${projectApi(owner, repo)}/commenti?opera=${encodeURIComponent(work)}&file=${encodeURIComponent(file)}`;
}

/** Risposte delle API di lettura da salvare: progetto, schede, panoramica, struttura e statistiche di ogni opera, commenti dei capitoli, appunti e strutture personali. */
export function dataToCache(owner: string, repo: string, project: ProjectData): string[] {
  const base = projectApi(owner, repo);
  const urls = [base, `${base}/schede`, `${base}/panoramica`, "/api/appunti", "/api/strutture"];
  for (const work of project.opere) {
    urls.push(`${base}/opere/${work.slug}/struttura`, `${base}/opere/${work.slug}/statistiche`);
    for (const c of work.capitoli) urls.push(commentsUrl(owner, repo, work.slug, c.file));
  }
  return urls;
}

/** Indirizzo dell'immagine di una mappa (la serve una API che il service worker tiene in cache). */
export function mapImageUrl(owner: string, repo: string, path: string): string {
  return `${projectApi(owner, repo)}/immagine?path=${encodeURIComponent(path)}`;
}

export function offlineSupported(): boolean {
  return typeof indexedDB !== "undefined" && typeof caches !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function loadTravelInfo(owner: string, repo: string): Promise<TravelInfo | null> {
  try {
    return ((await get(infoKey(owner, repo))) as TravelInfo | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function loadPackedFile(owner: string, repo: string, path: string): Promise<PackedFile | null> {
  try {
    return ((await get(fileKey(owner, repo, path))) as PackedFile | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Un capitolo scaricato con il progetto a cui appartiene, per aprirlo senza rete. */
export async function loadTravelCopy(owner: string, repo: string, path: string): Promise<{ project: ProjectData; file: PackedFile; scaricatoIl: number } | null> {
  const [info, file] = await Promise.all([loadTravelInfo(owner, repo), loadPackedFile(owner, repo, path)]);
  return info && file ? { project: info.project, file, scaricatoIl: info.scaricatoIl } : null;
}

/** Tiene la copia al passo con GitHub: dopo ogni lettura o salvataggio online di un capitolo già scaricato. */
export async function updatePackedFile(owner: string, repo: string, path: string, file: PackedFile): Promise<void> {
  try {
    if (await get(fileKey(owner, repo, path))) await set(fileKey(owner, repo, path), { text: file.text, sha: file.sha });
  } catch {
    // la copia resta quella di prima: al prossimo «Scarica» si riallinea
  }
}

/** Progetti scaricati su questo dispositivo, per aprire la libreria senza rete. */
export async function listTravelProjects(): Promise<TravelInfo[]> {
  try {
    const out: TravelInfo[] = [];
    for (const k of await keys()) {
      if (typeof k !== "string" || !k.startsWith(PREFIX) || k.startsWith(`${PREFIX}file:`) || k.startsWith(DATA_PREFIX)) continue;
      const info = (await get(k)) as TravelInfo | undefined;
      if (info) out.push(info);
    }
    return out.sort((a, b) => b.scaricatoIl - a.scaricatoIl);
  } catch {
    return [];
  }
}

async function primePages(urls: string[], onStep: () => void) {
  const assets = new Set<string>();
  for (const url of urls) {
    try {
      // Con Accept: text/html il service worker tiene la pagina in cache.
      const res = await fetch(url, { headers: { Accept: "text/html" }, credentials: "same-origin" });
      if (res.ok) for (const a of extractAssetUrls(await res.text())) assets.add(a);
    } catch {
      // una pagina in meno: si aprirà online
    }
    onStep();
  }
  // Script e stili delle pagine: passano dal service worker, che li tiene.
  await Promise.all([...assets].map((a) => fetch(a).then((r) => r.arrayBuffer()).catch(() => null)));
}

/**
 * Scarica il progetto: elenco, testo di tutti i capitoli, pagine, script e dizionario.
 * Se qualcosa va storto la copia precedente resta com'è.
 */
export async function downloadForTravel(owner: string, repo: string, onProgress?: (p: DownloadProgress) => void): Promise<TravelInfo> {
  if (!offlineSupported()) throw new ClientApiError(0, "Questo browser non permette di tenere una copia per lavorare senza rete.");
  const project = await api<ProjectData>(projectApi(owner, repo));
  const chapters: { path: string }[] = [];
  for (const work of project.opere) for (const c of work.capitoli) chapters.push({ path: chapterPath(work.slug, c.file) });
  const pages = pagesToCache(owner, repo, project);
  const dataUrls = dataToCache(owner, repo, project);
  const totale = chapters.length + dataUrls.length + pages.length + 1;
  let fatto = 0;
  const step = (passo: string) => onProgress?.({ fatto: ++fatto, totale, passo });

  const files = new Map<string, PackedFile>();
  for (const { path } of chapters) {
    const file = await api<PackedFile>(`${projectApi(owner, repo)}/file?path=${encodeURIComponent(path)}`);
    files.set(path, { text: file.text, sha: file.sha });
    step("Capitoli");
  }

  // Schede, struttura, panoramica, commenti, appunti: da consultare senza rete. Quel che manca (per esempio
  // nessuna libreria di appunti) si salta senza fermare il resto.
  const saved: string[] = [];
  let sheets: SheetsData | null = null;
  for (const url of dataUrls) {
    try {
      const data = await api<unknown>(url);
      saved.push(url);
      await storeOfflineJson(url, data);
      if (url === `${projectApi(owner, repo)}/schede`) sheets = data as SheetsData;
    } catch {
      // non disponibile: offline mancherà solo questo
    }
    step("Schede e struttura");
  }
  // Immagini delle mappe: il service worker le tiene in cache.
  for (const sheet of sheets?.mappe ?? []) {
    if (sheet.data.immagine) await fetch(mapImageUrl(owner, repo, sheet.data.immagine)).then((r) => r.arrayBuffer()).catch(() => null);
  }

  await primePages(pages, () => step("Pagine"));
  // Dizionario e controllo ortografico: così il testo si corregge anche senza rete.
  try {
    await loadItalianSpellChecker();
  } catch {
    // senza correzione ortografica si scrive lo stesso
  }
  step("Dizionario");

  try {
    for (const [path, file] of files) await set(fileKey(owner, repo, path), file);
    const info: TravelInfo = { scaricatoIl: Date.now(), project, capitoli: chapters.map((c) => c.path), dati: saved };
    await set(infoKey(owner, repo), info);
    return info;
  } catch {
    throw new ClientApiError(0, "Non c'è abbastanza spazio sul dispositivo per la copia. Libera spazio e riprova.");
  }
}

export async function removeTravelCopy(owner: string, repo: string): Promise<void> {
  try {
    const info = await loadTravelInfo(owner, repo);
    for (const path of info?.capitoli ?? []) await del(fileKey(owner, repo, path));
    // Le risposte di interesse generale (appunti, strutture personali) restano: servono agli altri progetti.
    for (const url of info?.dati ?? []) if (url.startsWith(projectApi(owner, repo))) await deleteOfflineJson(url);
    await del(infoKey(owner, repo));
  } catch {
    // niente da fare
  }
}

/** All'uscita dall'account: via le copie dei progetti e le pagine in cache (le bozze non ancora salvate restano, sono dell'autore). */
export async function clearOfflineData(): Promise<void> {
  try {
    for (const k of await keys()) if (typeof k === "string" && k.startsWith(PREFIX)) await del(k);
  } catch {
    // niente da fare
  }
  try {
    for (const name of await caches.keys()) if (name.startsWith("writly-")) await caches.delete(name);
  } catch {
    // niente da fare
  }
}
