import { NextResponse } from "next/server";
import { isId } from "@/lib/project/normalize";
import { ApiError, assertRepoRef, optionalSha, readJson, requireSha, requireText, withGitHub } from "@/lib/server/http";
import { moveNoteToLibrary } from "@/lib/server/notes";
import {
  deleteSheet,
  loadSheets,
  saveCategories,
  saveCharacter,
  saveChronology,
  saveGlossary,
  saveMap,
  savePdfTemplate,
  saveProjectNote,
  saveRelations,
  saveRules,
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

/**
 * Azioni (campo `azione`): personaggio, voce, relazioni, categorie, regole,
 * cronologia, mappa (con immagine facoltativa in base64), appunto, glossario,
 * sposta-in-libreria, elimina. I percorsi sono validati dal server.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    // Le mappe portano l'immagine (fino a 5 MB, circa 6,7 MB in base64).
    const body = await readJson(req, 7_500_000);
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
      case "regole":
        return NextResponse.json(await saveRules(gh, owner, repo, { sha: sha ?? null, items: body.items }));
      case "cronologia":
        return NextResponse.json(await saveChronology(gh, owner, repo, { sha: sha ?? null, data: body.data }));
      case "glossario":
        return NextResponse.json(await saveGlossary(gh, owner, repo, { sha: sha ?? null, items: body.items }));
      case "mappa": {
        const immagine = body.immagine;
        if (immagine !== undefined && immagine !== null && (typeof immagine !== "string" || !/^[A-Za-z0-9+/=]*$/.test(immagine))) {
          throw new ApiError(400, "Immagine non valida.");
        }
        return NextResponse.json(await saveMap(gh, owner, repo, { path, sha, data: body.data, immagine: immagine || undefined }));
      }
      case "template-pdf":
        return NextResponse.json(await savePdfTemplate(gh, owner, repo, { path, sha, data: body.data }));
      case "appunto":
        return NextResponse.json(await saveProjectNote(gh, owner, repo, { path, sha, data: body.data }));
      case "sposta-in-libreria":
        return NextResponse.json(await moveNoteToLibrary(gh, owner, repo, { path: requireText(body, "path", "Percorso"), sha: requireSha(body) }));
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
