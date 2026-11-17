import { NextResponse } from "next/server";
import { assertRepoRef, withGitHub } from "@/lib/server/http";
import { workStats } from "@/lib/server/structures";

type Ctx = { params: Promise<{ owner: string; repo: string; opera: string }> };

/** Parole e battute di ogni capitolo dell'opera, calcolate sulla versione salvata su GitHub. */
export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo, opera } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    return NextResponse.json({ capitoli: await workStats(gh, owner, repo, opera) }, { headers: { "Cache-Control": "no-store" } });
  });
}
