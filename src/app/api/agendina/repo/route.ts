import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import {
  createPersonalRepo,
  findPersonalRepo,
  getAuthenticatedUsername,
  putFile,
} from "@/lib/github";
import { NOTE_INDEX_PATH } from "@/lib/domain";
import { emptyJsonArray } from "@/lib/templates";

export async function GET() {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const username = await getAuthenticatedUsername(auth.octokit);
  const repo = await findPersonalRepo(auth.octokit, username);
  return NextResponse.json({ repo });
}

export async function POST() {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const username = await getAuthenticatedUsername(auth.octokit);
  const existing = await findPersonalRepo(auth.octokit, username);
  if (existing) {
    return NextResponse.json({ repo: existing });
  }

  const repo = await createPersonalRepo(auth.octokit);
  await putFile(
    auth.octokit,
    repo.owner,
    repo.repo,
    NOTE_INDEX_PATH,
    emptyJsonArray(),
    "Inizializza indice note"
  );

  return NextResponse.json({ repo }, { status: 201 });
}
