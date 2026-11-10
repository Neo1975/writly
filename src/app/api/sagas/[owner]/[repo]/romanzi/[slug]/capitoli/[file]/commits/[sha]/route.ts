import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { getFileAtRef } from "@/lib/github";
import { capitoliDirFor, isSafeSlug } from "@/lib/domain";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string; file: string; sha: string }>;
}

const SAFE_FILENAME = /^[\w.-]+\.md$/;
const SAFE_SHA = /^[0-9a-f]{7,40}$/i;

export const GET = withGithubAuthHandling(async (_request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug, file, sha } = await params;
  const name = decodeURIComponent(file);
  if (!isSafeSlug(slug) || !SAFE_FILENAME.test(name) || !SAFE_SHA.test(sha)) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const path = `${capitoliDirFor(slug)}/${name}`;
  const content = await getFileAtRef(auth.octokit, owner, repo, path, sha);
  if (content === null) {
    return NextResponse.json({ error: "Versione non trovata" }, { status: 404 });
  }
  return NextResponse.json({ content });
});
