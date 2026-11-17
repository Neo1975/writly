import { NextResponse } from "next/server";
import { isId } from "@/lib/project/normalize";
import { ApiError, assertRepoRef, optionalSha, readJson, requireSha, requireText, withGitHub } from "@/lib/server/http";
import {
  deleteSheet,
  loadSheets,
  saveCategories,
  saveCharacter,
  saveRelations,
  saveWorldEntry,
} from "@/lib/server/sheets";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

/** Personaggi, relazioni, categorie e voci del mondo del progetto. */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    return NextResponse.json(await loadSheets(gh, owner, repo), { headers: { "Cache-Control": "no-store" } });
  });
}

function optionalPath(body: Record<string, unknown>): string | undefined {
  const v = body.path;
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.length > 200) throw new ApiError(400, "Percorso non valido.");
  return v;
}

/** Azioni (campo `azione`): personaggio, voce, relazioni, categorie, elimina. I percorsi sono validati dal server. */
export async function POST(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const body = await readJson(req);
    const path = optionalPath(body);
    const sha = optionalSha(body) ?? undefined;
    if (path && !sha) throw new ApiError(400, "Versione di partenza mancante.");

    switch (body.azione) {
      case "personaggio":
        return NextResponse.json(await saveCharacter(gh, owner, repo, { path, sha, data: body.data }));
      case "voce": {
        const categoria = typeof body.categoria === "string" ? body.categoria : undefined;
        return NextResponse.json(await saveWorldEntry(gh, owner, repo, { path, sha, categoria, data: body.data }));
      }
      case "relazioni":
        return NextResponse.json(await saveRelations(gh, owner, repo, { sha: sha ?? null, items: body.items }));
      case "categorie":
        return NextResponse.json(await saveCategories(gh, owner, repo, { sha: sha ?? null, items: body.items }));
      case "elimina": {
        const id = isId(body.id) ? body.id : undefined;
        await deleteSheet(gh, owner, repo, { path: requireText(body, "path", "Percorso"), sha: requireSha(body), id });
        return NextResponse.json({ ok: true });
      }
      default:
        throw new ApiError(400, "Azione non riconosciuta.");
    }
  });
}
