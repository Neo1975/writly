import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { getCharacters, saveCharacters } from "@/lib/domain";
import { isCharacter } from "@/lib/validation";
import type { Character } from "@/lib/types";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export const GET = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
  const { characters } = await getCharacters(auth.octokit, owner, repo, branch);
  return NextResponse.json({ characters });
});

export const PUT = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (!Array.isArray(body.characters) || !body.characters.every(isCharacter)) {
    return NextResponse.json(
      { error: "characters deve essere un array di personaggi validi" },
      { status: 400 }
    );
  }
  const characters = body.characters as Character[];
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Aggiorna schede personaggi";

  const { sha } = await getCharacters(auth.octokit, owner, repo, branch);
  await saveCharacters(auth.octokit, owner, repo, characters, sha, message, branch);

  return NextResponse.json({ characters });
});
