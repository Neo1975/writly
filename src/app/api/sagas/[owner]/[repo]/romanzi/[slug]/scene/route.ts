import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { getScenes, isSafeSlug, saveScenes } from "@/lib/domain";
import { isScene } from "@/lib/validation";
import type { Scene } from "@/lib/types";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}

export const GET = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  if (!isSafeSlug(slug)) {
    return NextResponse.json({ error: "Slug non valido" }, { status: 400 });
  }
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
  const { scenes } = await getScenes(auth.octokit, owner, repo, slug, branch);
  return NextResponse.json({ scenes });
});

export const PUT = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  if (!isSafeSlug(slug)) {
    return NextResponse.json({ error: "Slug non valido" }, { status: 400 });
  }
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (!Array.isArray(body.scenes) || !body.scenes.every(isScene)) {
    return NextResponse.json(
      { error: "scenes deve essere un array di scene valide" },
      { status: 400 }
    );
  }
  const scenes = body.scenes as Scene[];
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Aggiorna architettura scene";

  const { sha } = await getScenes(auth.octokit, owner, repo, slug, branch);
  await saveScenes(auth.octokit, owner, repo, slug, scenes, sha, message, branch);

  return NextResponse.json({ scenes });
});
