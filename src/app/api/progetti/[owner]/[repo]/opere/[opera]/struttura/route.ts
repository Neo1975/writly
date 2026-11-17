import { NextResponse } from "next/server";
import { assertRepoRef, optionalSha, readJson, requireText, withGitHub } from "@/lib/server/http";
import { loadWorkStructure, saveWorkStructure } from "@/lib/server/structures";

type Ctx = { params: Promise<{ owner: string; repo: string; opera: string }> };

/** Struttura narrativa e scene dell'opera (`struttura: null` se non è ancora stato scelto un modello). */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo, opera } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    return NextResponse.json(await loadWorkStructure(gh, owner, repo, opera), { headers: { "Cache-Control": "no-store" } });
  });
}

/** Salva la struttura (un commit). Con `sha` GitHub rifiuta se il file è cambiato nel frattempo. */
export async function PUT(req: Request, { params }: Ctx) {
  const { owner, repo, opera } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const body = await readJson(req);
    const result = await saveWorkStructure(gh, owner, repo, opera, {
      sha: optionalSha(body),
      data: body.struttura,
      message: requireText(body, "message", "Descrizione della versione", 500),
    });
    return NextResponse.json(result);
  });
}
