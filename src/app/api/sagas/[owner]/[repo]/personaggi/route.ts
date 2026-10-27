import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { getCharacters, saveCharacters } from "@/lib/domain";
import type { Character } from "@/lib/types";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
  const { characters } = await getCharacters(auth.octokit, owner, repo, branch);
  return NextResponse.json({ characters });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await request.json();
  if (!Array.isArray(body.characters)) {
    return NextResponse.json(
      { error: "characters deve essere un array" },
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
}
