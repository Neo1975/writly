import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { getDefaultBranch, listBranches } from "@/lib/github";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export const GET = withGithubAuthHandling(async (_request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;

  const [branches, defaultBranch] = await Promise.all([
    listBranches(auth.octokit, owner, repo),
    getDefaultBranch(auth.octokit, owner, repo),
  ]);

  return NextResponse.json({ branches, defaultBranch });
});
