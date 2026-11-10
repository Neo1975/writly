import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { listFileCommits } from "@/lib/github";
import { capitoliDirFor, isSafeSlug } from "@/lib/domain";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string; file: string }>;
}

const SAFE_FILENAME = /^[\w.-]+\.md$/;

export const GET = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug, file } = await params;
  const name = decodeURIComponent(file);
  if (!isSafeSlug(slug) || !SAFE_FILENAME.test(name)) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const path = `${capitoliDirFor(slug)}/${name}`;
  const commits = await listFileCommits(auth.octokit, owner, repo, path, { branch });
  return NextResponse.json({ commits });
});
