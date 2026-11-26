import { NextResponse } from "next/server";
import { ApiError, optionalSha, readJson, requireSha, requireText, withGitHub } from "@/lib/server/http";
import { deleteLibraryStructure, loadLibrary, saveLibraryStructure } from "@/lib/server/structures";

/** Strutture predefinite e personali (repository writly-libreria dell'autore). */
export async function GET(req: Request) {
  return withGitHub(req, async (gh) => NextResponse.json(await loadLibrary(gh), { headers: { "Cache-Control": "no-store" } }));
}

/** `azione`: «salva» (nuova senza id, oppure id + sha) o «elimina» (id + sha). */
export async function POST(req: Request) {
  return withGitHub(req, async (gh) => {
    const body = await readJson(req);
    const id = typeof body.id === "string" && body.id ? body.id : undefined;
    switch (body.azione) {
      case "salva": {
        const sha = optionalSha(body) ?? undefined;
        if (id && !sha) throw new ApiError(400, "Versione di partenza mancante.");
        return NextResponse.json(await saveLibraryStructure(gh, { id, sha, data: body.struttura }));
      }
      case "elimina":
        await deleteLibraryStructure(gh, requireText(body, "id", "Struttura", 80), requireSha(body));
        return NextResponse.json({ ok: true });
      default:
        throw new ApiError(400, "Azione non riconosciuta.");
    }
  });
}
