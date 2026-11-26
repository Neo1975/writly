import { NextResponse } from "next/server";
import { getLogin } from "@/lib/server/github";
import { findComment, loadComments, newCommentId, updateComments, type CommentsTarget } from "@/lib/server/comments";
import { ApiError, assertRepoRef, optionalText, readJson, requireText, withGitHub } from "@/lib/server/http";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

const MAX_TEXT = 5000;

function target(owner: string, repo: string, src: { opera?: unknown; file?: unknown; ramo?: unknown }): CommentsTarget {
  if (typeof src.opera !== "string" || typeof src.file !== "string") throw new ApiError(400, "Capitolo non valido.");
  const ramo = typeof src.ramo === "string" && src.ramo ? src.ramo : undefined;
  return { owner, repo, work: src.opera, file: src.file, ...(ramo ? { ramo } : {}) };
}

/** GET ?opera=&file=[&ramo=] — commenti del capitolo (dell'autore e del mentore AI). */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const q = new URL(req.url).searchParams;
    const t = target(owner, repo, { opera: q.get("opera") ?? undefined, file: q.get("file") ?? undefined, ramo: q.get("ramo") ?? undefined });
    return NextResponse.json(await loadComments(gh, t), { headers: { "Cache-Control": "no-store" } });
  });
}

/**
 * `azione`: «aggiungi» (citazione, prima, dopo, testo), «rispondi» (id, testo),
 * «risolvi» (id, risolto), «elimina» (id; solo i commenti dell'autore: quelli
 * del mentore si chiudono, non si cancellano, così resta traccia dell'aiuto AI).
 */
export async function POST(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const body = await readJson(req, 200_000);
    const t = target(owner, repo, body);
    const now = new Date().toISOString();
    const id = () => requireText(body, "id", "Commento", 60);
    let commenti;
    switch (body.azione) {
      case "aggiungi": {
        const testo = requireText(body, "testo", "Commento", MAX_TEXT);
        const citazione = optionalText(body, "citazione", 2000) ?? "";
        const prima = citazione ? (optionalText(body, "prima", 120) ?? "") : "";
        const dopo = citazione ? (optionalText(body, "dopo", 120) ?? "") : "";
        const autore = await getLogin(gh);
        commenti = await updateComments(gh, t, `Commento al capitolo ${t.file.replace(/\.md$/, "")}`, (list) => [
          ...list,
          { id: newCommentId(list), tipo: "autore", autore, creato: now, categoria: "", citazione, prima, dopo, testo, risolto: false, risposte: [] },
        ]);
        break;
      }
      case "rispondi": {
        const cid = id();
        const testo = requireText(body, "testo", "Risposta", MAX_TEXT);
        const autore = await getLogin(gh);
        commenti = await updateComments(gh, t, `Risposta a un commento (${t.file.replace(/\.md$/, "")})`, (list) => {
          findComment(list, cid);
          return list.map((c) => (c.id === cid ? { ...c, risposte: [...c.risposte, { tipo: "autore" as const, autore, creato: now, testo }] } : c));
        });
        break;
      }
      case "risolvi": {
        const cid = id();
        const risolto = body.risolto !== false;
        commenti = await updateComments(gh, t, `${risolto ? "Chiude" : "Riapre"} un commento (${t.file.replace(/\.md$/, "")})`, (list) => {
          findComment(list, cid);
          return list.map((c) => (c.id === cid ? { ...c, risolto } : c));
        });
        break;
      }
      case "elimina": {
        const cid = id();
        commenti = await updateComments(gh, t, `Elimina un commento (${t.file.replace(/\.md$/, "")})`, (list) => {
          if (findComment(list, cid).tipo !== "autore") throw new ApiError(403, "I commenti del mentore AI non si eliminano: puoi chiuderli.");
          return list.filter((c) => c.id !== cid);
        });
        break;
      }
      default:
        throw new ApiError(400, "Azione non riconosciuta.");
    }
    return NextResponse.json({ commenti, errori: [] });
  });
}
