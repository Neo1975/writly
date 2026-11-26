import { NextResponse } from "next/server";
import { ApiError, assertRepoRef, readJson, requireText, withGitHub } from "@/lib/server/http";
import { createVariant, deleteVariant, listVariants, mergeVariant } from "@/lib/server/variants";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

/** Varianti (rami Git) del progetto. */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    return NextResponse.json(await listVariants(gh, owner, repo), { headers: { "Cache-Control": "no-store" } });
  });
}

/** `azione`: «crea» (nome), «elimina» (ramo), «unisci» (ramo nella versione principale). */
export async function POST(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const body = await readJson(req);
    switch (body.azione) {
      case "crea":
        return NextResponse.json(await createVariant(gh, owner, repo, requireText(body, "nome", "Nome della variante", 60)), { status: 201 });
      case "elimina":
        await deleteVariant(gh, owner, repo, requireText(body, "ramo", "Variante", 90));
        return NextResponse.json({ ok: true });
      case "unisci":
        return NextResponse.json(await mergeVariant(gh, owner, repo, requireText(body, "ramo", "Variante", 90)));
      default:
        throw new ApiError(400, "Azione non riconosciuta.");
    }
  });
}
