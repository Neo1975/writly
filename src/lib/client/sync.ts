import { parseChapter, serializeChapter } from "@/lib/project/format";
import { api, ClientApiError, projectApi } from "./api";
import { clearDraft, loadDraft, saveDraft, type Draft, type DraftEntry } from "./drafts";
import { updatePackedFile } from "./offline";

/**
 * Allineamento delle bozze scritte senza rete (o non ancora salvate) con GitHub.
 *
 * Per ogni bozza: se il capitolo su GitHub è ancora alla versione da cui la bozza è partita
 * (`baseSha`), la bozza diventa una versione (un commit); altrimenti NON si tocca niente e la
 * bozza resta lì per il confronto e l'unione nell'editor. Mai sovrascritture.
 */

export type SyncOutcome =
  | "salvato" // scritta su GitHub come nuova versione
  | "gia-allineato" // il capitolo su GitHub era già uguale
  | "conflitto" // su GitHub è cambiato: si apre il capitolo e si unisce
  | "assente" // il capitolo non c'è più su GitHub
  | "rete" // manca la rete: si riprova dopo
  | "errore"; // altro (accesso scaduto, repository non raggiungibile…)

export interface SyncResult {
  entry: DraftEntry;
  outcome: SyncOutcome;
  message?: string;
}

/** Tutto ciò che serve fuori dalla logica: lettura e scrittura su GitHub, bozze locali, copia scaricata. */
export interface SyncIO {
  readRemote(entry: DraftEntry): Promise<{ text: string; sha: string }>;
  writeRemote(entry: DraftEntry, text: string, sha: string, message: string): Promise<string>;
  loadDraft(entry: DraftEntry): Promise<Draft | null>;
  saveDraft(entry: DraftEntry, draft: Draft): Promise<unknown>;
  clearDraft(entry: DraftEntry): Promise<void>;
  updatePacked(entry: DraftEntry, file: { text: string; sha: string }): Promise<void>;
}

const status = (err: unknown) => (err instanceof ClientApiError ? err.status : -1);

export function syncMessage(entry: DraftEntry): string {
  return `Modifiche scritte senza rete (${entry.path.slice(entry.path.lastIndexOf("/") + 1)})`;
}

export async function syncEntry(entry: DraftEntry, io: SyncIO): Promise<SyncResult> {
  const fail = (err: unknown): SyncResult => {
    const s = status(err);
    if (s === 0) return { entry, outcome: "rete" };
    if (s === 409) return { entry, outcome: "conflitto" };
    if (s === 404) return { entry, outcome: "assente" };
    return { entry, outcome: "errore", message: err instanceof Error ? err.message : "Errore sconosciuto." };
  };

  let remote: { text: string; sha: string };
  try {
    remote = await io.readRemote(entry);
  } catch (err) {
    return fail(err);
  }
  if (remote.sha !== entry.draft.baseSha) return { entry, outcome: "conflitto" };

  const current = parseChapter(remote.text);
  if (current.body === entry.draft.body && current.meta.stato === entry.draft.stato) {
    await io.clearDraft(entry);
    return { entry, outcome: "gia-allineato" };
  }

  const text = serializeChapter({ meta: { ...current.meta, stato: entry.draft.stato }, body: entry.draft.body });
  let sha: string;
  try {
    sha = await io.writeRemote(entry, text, remote.sha, syncMessage(entry));
  } catch (err) {
    return fail(err);
  }
  // Se nel frattempo la bozza è cambiata (un'altra scheda del browser), la nuova parte dalla versione appena scritta.
  const latest = await io.loadDraft(entry);
  if (latest && latest.updatedAt !== entry.draft.updatedAt) await io.saveDraft(entry, { ...latest, baseSha: sha });
  else await io.clearDraft(entry);
  if (!entry.variant) await io.updatePacked(entry, { text, sha });
  return { entry, outcome: "salvato" };
}

/** Allinea le bozze una dopo l'altra; si ferma alla prima volta che manca la rete. `skip` esclude quelle aperte in un editor. */
export async function syncAll(entries: DraftEntry[], io: SyncIO, skip?: (entry: DraftEntry) => boolean): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const entry of entries) {
    if (skip?.(entry)) continue;
    const result = await syncEntry(entry, io);
    results.push(result);
    if (result.outcome === "rete") break;
  }
  return results;
}

/** Pagina del capitolo nell'app (per aprirlo, e per riconoscere quello aperto ora). */
export function chapterPage(entry: Pick<DraftEntry, "owner" | "repo" | "path">): string {
  const m = /^opere\/([^/]+)\/capitoli\/([^/]+)\.md$/.exec(entry.path);
  return m ? `/progetto/${entry.owner}/${entry.repo}/${m[1]}/${m[2]}` : `/progetto/${entry.owner}/${entry.repo}`;
}

const draftId = (entry: DraftEntry) => (entry.variant ? `${entry.path}@${entry.variant}` : entry.path);
const ramoQuery = (entry: DraftEntry) => (entry.variant ? `&ramo=${encodeURIComponent(entry.variant)}` : "");

/** L'IO vero, nel browser. */
export const browserSyncIO: SyncIO = {
  readRemote: (e) => api<{ text: string; sha: string }>(`${projectApi(e.owner, e.repo)}/file?path=${encodeURIComponent(e.path)}${ramoQuery(e)}`),
  writeRemote: async (e, text, sha, message) =>
    (
      await api<{ sha: string }>(`${projectApi(e.owner, e.repo)}/file`, {
        method: "PUT",
        json: { path: e.path, text, sha, message, ...(e.variant ? { ramo: e.variant } : {}) },
      })
    ).sha,
  loadDraft: (e) => loadDraft(e.owner, e.repo, draftId(e)),
  saveDraft: (e, draft) => saveDraft(e.owner, e.repo, draftId(e), draft),
  clearDraft: (e) => clearDraft(e.owner, e.repo, draftId(e)),
  updatePacked: (e, file) => updatePackedFile(e.owner, e.repo, e.path, file),
};
