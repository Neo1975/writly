import { NextResponse } from "next/server";
import { ApiError, assertRepoRef, optionalSha, readJson, requireSha, requireText, withGitHub } from "@/lib/server/http";
import { deleteLibraryNote, loadLibraryNotes, moveNoteToProject, saveLibraryNote } from "@/lib/server/notes";

/** Appunti globali (repository writly-libreria dell'autore). */
export async function GET(req: Request) {
  return withGitHub(req, async (gh) => NextResponse.json(await loadLibraryNotes(gh), { headers: { "Cache-Control": "no-store" } }));
}

/** `azione`: «salva» (nuovo senza path), «elimina», «sposta» (in un progetto: owner + repo). */
export async function POST(req: Request) {
  return withGitHub(req, async (gh) => {
    const body = await readJson(req);
    const path = typeof body.path === "string" && body.path ? body.path : undefined;
    switch (body.azione) {
      case "salva": {
        const sha = optionalSha(body) ?? undefined;
        if (path && !sha) throw new ApiError(400, "Versione di partenza mancante.");
        return NextResponse.json(await saveLibraryNote(gh, { path, sha, data: body.data }));
      }
      case "elimina":
        await deleteLibraryNote(gh, { path: requireText(body, "path", "Percorso"), sha: requireSha(body) });
        return NextResponse.json({ ok: true });
      case "sposta": {
        const owner = requireText(body, "owner", "Progetto", 40);
        const repo = requireText(body, "repo", "Progetto", 100);
        assertRepoRef(owner, repo);
        return NextResponse.json(await moveNoteToProject(gh, { path: requireText(body, "path", "Percorso"), sha: requireSha(body), owner, repo }));
      }
      default:
        throw new ApiError(400, "Azione non riconosciuta.");
    }
  });
}
