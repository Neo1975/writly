import type { Octokit } from "octokit";
import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { findPersonalRepo, getAuthenticatedUsername } from "@/lib/github";
import {
  deleteNote,
  getNoteContent,
  getNoteIndex,
  isSafeSlug,
  saveNoteContent,
  saveNoteIndex,
} from "@/lib/domain";
import type { NoteCategory } from "@/lib/types";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

const CATEGORIES: NoteCategory[] = [
  "personaggio",
  "worldbuilding",
  "parola",
  "spunto",
  "generale",
];

interface RouteParams {
  params: Promise<{ slug: string }>;
}

async function resolveRepo(octokit: Octokit) {
  const username = await getAuthenticatedUsername(octokit);
  return findPersonalRepo(octokit, username);
}

export const GET = withGithubAuthHandling(async (_request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { slug } = await params;
  if (!isSafeSlug(slug)) {
    return NextResponse.json({ error: "Slug non valido" }, { status: 400 });
  }
  const repo = await resolveRepo(auth.octokit);
  if (!repo) {
    return NextResponse.json({ error: "Agendina non ancora creata" }, { status: 404 });
  }

  const [note, { notes }] = await Promise.all([
    getNoteContent(auth.octokit, repo.owner, repo.repo, slug),
    getNoteIndex(auth.octokit, repo.owner, repo.repo),
  ]);
  if (!note) {
    return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
  }
  const meta = notes.find((n) => n.slug === slug) ?? null;

  return NextResponse.json({ content: note.content, meta });
});

export const PUT = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { slug } = await params;
  if (!isSafeSlug(slug)) {
    return NextResponse.json({ error: "Slug non valido" }, { status: 400 });
  }
  const repo = await resolveRepo(auth.octokit);
  if (!repo) {
    return NextResponse.json({ error: "Agendina non ancora creata" }, { status: 404 });
  }

  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content deve essere una stringa" }, { status: 400 });
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : slug;
  const category: NoteCategory = CATEGORIES.includes(body.category as NoteCategory)
    ? (body.category as NoteCategory)
    : "generale";
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : `Aggiorna nota "${title}"`;

  const [existing, { notes, sha: indexSha }] = await Promise.all([
    getNoteContent(auth.octokit, repo.owner, repo.repo, slug),
    getNoteIndex(auth.octokit, repo.owner, repo.repo),
  ]);
  if (!existing) {
    return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
  }

  await saveNoteContent(auth.octokit, repo.owner, repo.repo, slug, body.content, existing.sha, message);

  const updatedAt = new Date().toISOString();
  const updatedNotes = notes.map((n) =>
    n.slug === slug ? { ...n, title, category, tags, updatedAt } : n
  );
  await saveNoteIndex(auth.octokit, repo.owner, repo.repo, updatedNotes, indexSha, message);

  return NextResponse.json({
    meta: updatedNotes.find((n) => n.slug === slug) ?? null,
  });
});

export const DELETE = withGithubAuthHandling(async (_request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { slug } = await params;
  if (!isSafeSlug(slug)) {
    return NextResponse.json({ error: "Slug non valido" }, { status: 400 });
  }
  const repo = await resolveRepo(auth.octokit);
  if (!repo) {
    return NextResponse.json({ error: "Agendina non ancora creata" }, { status: 404 });
  }

  const [existing, { notes, sha: indexSha }] = await Promise.all([
    getNoteContent(auth.octokit, repo.owner, repo.repo, slug),
    getNoteIndex(auth.octokit, repo.owner, repo.repo),
  ]);
  if (!existing) {
    return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
  }

  await deleteNote(auth.octokit, repo.owner, repo.repo, slug, existing.sha, `Elimina nota "${slug}"`);
  const updatedNotes = notes.filter((n) => n.slug !== slug);
  await saveNoteIndex(
    auth.octokit,
    repo.owner,
    repo.repo,
    updatedNotes,
    indexSha,
    `Elimina nota "${slug}"`
  );

  return NextResponse.json({ ok: true });
});
