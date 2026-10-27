import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { getScenes, saveScenes } from "@/lib/domain";
import type { Scene } from "@/lib/types";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
  const { scenes } = await getScenes(auth.octokit, owner, repo, slug, branch);
  return NextResponse.json({ scenes });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await request.json();
  if (!Array.isArray(body.scenes)) {
    return NextResponse.json({ error: "scenes deve essere un array" }, { status: 400 });
  }
  const scenes = body.scenes as Scene[];
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Aggiorna architettura scene";

  const { sha } = await getScenes(auth.octokit, owner, repo, slug, branch);
  await saveScenes(auth.octokit, owner, repo, slug, scenes, sha, message, branch);

  return NextResponse.json({ scenes });
}
