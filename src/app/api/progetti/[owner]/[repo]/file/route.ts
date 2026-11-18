import { NextResponse } from "next/server";
import { parseChapter } from "@/lib/project/format";
import { isReadablePath, isVariantRef, isWritableTextPath } from "@/lib/project/paths";
import { listFileCommits, readText, writeText } from "@/lib/server/github";
import { ApiError, assertRepoRef, readJson, requireText, withGitHub } from "@/lib/server/http";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

const MAX_CHAPTER_BYTES = 2_000_000;

/**
 * GET ?path=...            contenuto attuale (testo + sha)
 * GET ?path=...&ref=<sha>  contenuto a un commit (per lo storico)
 * GET ?path=...&storia=1   elenco dei commit che hanno toccato il file
 * Con &ramo=variante/<nome> le stesse letture valgono su una variante.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const url = new URL(req.url);
    const path = url.searchParams.get("path") ?? "";
    if (!isReadablePath(path)) throw new ApiError(400, "Percorso non consentito.");
    const ramo = url.searchParams.get("ramo") ?? undefined;
    if (ramo !== undefined && !isVariantRef(ramo)) throw new ApiError(400, "Variante non valida.");

    if (url.searchParams.get("storia")) {
      return NextResponse.json({ commits: await listFileCommits(gh, owner, repo, path, ramo) });
    }
    const sha = url.searchParams.get("ref") ?? undefined;
    if (sha !== undefined && !/^[0-9a-f]{7,40}$/.test(sha)) throw new ApiError(400, "Versione non valida.");
    const ref = sha ?? ramo;
    const file = await readText(gh, owner, repo, path, ref);
    if (!file) throw new ApiError(404, "File non trovato.");
    return NextResponse.json(file, { headers: { "Cache-Control": "no-store" } });
  });
}

/** Salva una nuova versione del capitolo (un commit). Richiede lo sha letto, per non sovrascrivere modifiche altrui. */
export async function PUT(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const body = await readJson(req);
    const path = requireText(body, "path", "Percorso", 200);
    if (!isWritableTextPath(path)) throw new ApiError(400, "Percorso non consentito.");
    const sha = requireText(body, "sha", "Versione di partenza", 40);
    const message = requireText(body, "message", "Descrizione della versione", 500);
    const text = body.text;
    if (typeof text !== "string") throw new ApiError(400, "Testo mancante.");
    if (Buffer.byteLength(text, "utf8") > MAX_CHAPTER_BYTES) throw new ApiError(413, "Capitolo troppo lungo (oltre 2 MB).");
    parseChapter(text); // il front-matter deve restare valido
    const ramo = body.ramo;
    if (ramo !== undefined && ramo !== null && (typeof ramo !== "string" || !isVariantRef(ramo))) throw new ApiError(400, "Variante non valida.");

    const newSha = await writeText(gh, { owner, repo, path, text, sha, message, ...(ramo ? { branch: ramo } : {}) });
    return NextResponse.json({ sha: newSha });
  });
}
