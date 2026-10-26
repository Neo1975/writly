import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { listFileCommits } from "@/lib/github";
import { capitoliDirFor } from "@/lib/domain";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string; file: string }>;
}

const SAFE_FILENAME = /^[\w.-]+\.md$/;

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug, file } = await params;
  const name = decodeURIComponent(file);
  if (!SAFE_FILENAME.test(name)) {
    return NextResponse.json({ error: "Nome file non valido" }, { status: 400 });
  }

  const path = `${capitoliDirFor(slug)}/${name}`;
  const commits = await listFileCommits(auth.octokit, owner, repo, path);
  return NextResponse.json({ commits });
}
