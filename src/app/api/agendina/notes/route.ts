import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { findPersonalRepo, getAuthenticatedUsername, putFile } from "@/lib/github";
import { getNoteIndex, notePathFor, saveNoteIndex } from "@/lib/domain";
import { slugify } from "@/lib/templates";
import type { NoteCategory, NoteMeta } from "@/lib/types";

const CATEGORIES: NoteCategory[] = [
  "personaggio",
  "worldbuilding",
  "parola",
  "spunto",
  "generale",
];

export async function GET() {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const username = await getAuthenticatedUsername(auth.octokit);
  const repo = await findPersonalRepo(auth.octokit, username);
  if (!repo) {
    return NextResponse.json({ error: "Agendina non ancora creata" }, { status: 404 });
  }
  const { notes } = await getNoteIndex(auth.octokit, repo.owner, repo.repo);
  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const username = await getAuthenticatedUsername(auth.octokit);
  const repo = await findPersonalRepo(auth.octokit, username);
  if (!repo) {
    return NextResponse.json({ error: "Agendina non ancora creata" }, { status: 404 });
  }

  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Nuova nota";
  const category: NoteCategory = CATEGORIES.includes(body.category as NoteCategory)
    ? (body.category as NoteCategory)
    : "generale";

  const { notes, sha } = await getNoteIndex(auth.octokit, repo.owner, repo.repo);
  const baseSlug = slugify(title) || "nota";
  let slug = baseSlug;
  let suffix = 2;
  while (notes.some((n) => n.slug === slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  await putFile(
    auth.octokit,
    repo.owner,
    repo.repo,
    notePathFor(slug),
    `# ${title}\n\n`,
    `Crea nota "${title}"`
  );

  const meta: NoteMeta = {
    slug,
    title,
    category,
    tags: [],
    updatedAt: new Date().toISOString(),
  };
  const updated = [...notes, meta];
  await saveNoteIndex(auth.octokit, repo.owner, repo.repo, updated, sha, `Crea nota "${title}"`);

  return NextResponse.json({ note: meta }, { status: 201 });
}
