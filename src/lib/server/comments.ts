import { parseComments, serializeComments, type ChapterComment } from "@/lib/project/comments";
import { commentsPath, isChapterFile, isSlug, isVariantRef } from "@/lib/project/paths";
import { shortId } from "@/lib/project/slug";
import { ApiError } from "./errors";
import { readText, writeText, type GitHub } from "./github";

/**
 * Commenti di un capitolo (opere/<opera>/commenti/<capitolo>.yaml), sullo
 * stesso ramo del capitolo. Ogni modifica rilegge il file e lo riscrive con lo
 * sha appena letto: se nel frattempo è cambiato (il mentore AI ha fatto un
 * commit, o un altro dispositivo) si riprova sulla versione nuova, così nessun
 * commento va perso.
 */

export interface CommentsTarget {
  owner: string;
  repo: string;
  work: string;
  file: string;
  ramo?: string;
}

function assertTarget(t: CommentsTarget) {
  if (!isSlug(t.work) || !isChapterFile(t.file)) throw new ApiError(400, "Capitolo non valido.");
  if (t.ramo !== undefined && !isVariantRef(t.ramo)) throw new ApiError(400, "Variante non valida.");
}

export async function loadComments(gh: GitHub, t: CommentsTarget): Promise<{ commenti: ChapterComment[]; errori: string[] }> {
  assertTarget(t);
  const path = commentsPath(t.work, t.file);
  const file = await readText(gh, t.owner, t.repo, path, t.ramo);
  return file ? parseComments(file.text, path) : { commenti: [], errori: [] };
}

export async function updateComments(
  gh: GitHub,
  t: CommentsTarget,
  message: string,
  change: (commenti: ChapterComment[]) => ChapterComment[],
): Promise<ChapterComment[]> {
  assertTarget(t);
  const path = commentsPath(t.work, t.file);
  for (let attempt = 0; ; attempt++) {
    const file = await readText(gh, t.owner, t.repo, path, t.ramo);
    const current = file ? parseComments(file.text, path) : { commenti: [], errori: [] };
    // Un file con commenti illeggibili non si riscrive: li perderemmo.
    if (current.errori.length) throw new ApiError(422, `Il file dei commenti ha parti non leggibili (${current.errori[0]}). Correggilo nel repository prima di modificarlo da qui.`);
    const next = change(current.commenti);
    try {
      await writeText(gh, { owner: t.owner, repo: t.repo, path, text: serializeComments(next), message, ...(file ? { sha: file.sha } : {}), ...(t.ramo ? { branch: t.ramo } : {}) });
      return next;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (attempt < 2 && (status === 409 || status === 422)) continue;
      throw err;
    }
  }
}

export function newCommentId(taken: ChapterComment[]): string {
  const used = new Set(taken.map((c) => c.id));
  for (;;) {
    const id = `c${shortId().slice(0, 7)}`;
    if (!used.has(id)) return id;
  }
}

export function findComment(commenti: ChapterComment[], id: string): ChapterComment {
  const c = commenti.find((x) => x.id === id);
  if (!c) throw new ApiError(404, "Commento non trovato: forse è stato eliminato nel frattempo.");
  return c;
}
