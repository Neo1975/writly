import { NextResponse } from "next/server";
import { assertRepoRef, withGitHub } from "@/lib/server/http";
import { loadOverview } from "@/lib/server/overview";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

/** Statistiche, presenze e avvisi di continuità di tutte le opere del progetto (sola lettura). */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    return NextResponse.json(await loadOverview(gh, owner, repo), { headers: { "Cache-Control": "no-store" } });
  });
}
