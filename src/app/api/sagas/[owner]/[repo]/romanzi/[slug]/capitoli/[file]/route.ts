import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSessionOctokit } from "@/lib/session-github";
import { getFile, putFile } from "@/lib/github";
import { appendComment, capitoliDirFor, getComments, removeComment } from "@/lib/domain";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string; file: string }>;
}

const SAFE_FILENAME = /^[\w.-]+\.md$/;

function resolveMdPath(slug: string, file: string): string | null {
  const name = decodeURIComponent(file);
  if (!SAFE_FILENAME.test(name)) return null;
  return `${capitoliDirFor(slug)}/${name}`;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug, file } = await params;
  const mdPath = resolveMdPath(slug, file);
  if (!mdPath) {
    return NextResponse.json({ error: "Nome file non valido" }, { status: 400 });
  }
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const chapterFile = await getFile(auth.octokit, owner, repo, mdPath, branch);
  if (!chapterFile) {
    return NextResponse.json({ error: "Capitolo non trovato" }, { status: 404 });
  }
  const { comments } = await getComments(auth.octokit, owner, repo, mdPath, branch);

  return NextResponse.json({
    content: chapterFile.content,
    sha: chapterFile.sha,
    comments,
  });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug, file } = await params;
  const mdPath = resolveMdPath(slug, file);
  if (!mdPath) {
    return NextResponse.json({ error: "Nome file non valido" }, { status: 400 });
  }
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await request.json();

  if (body.action === "save-content") {
    const content = typeof body.content === "string" ? body.content : "";
    const sha = typeof body.sha === "string" ? body.sha : undefined;
    const result = await putFile(
      auth.octokit,
      owner,
      repo,
      mdPath,
      content,
      typeof body.message === "string" ? body.message : "Aggiorna capitolo",
      sha,
      branch
    );
    return NextResponse.json({ sha: result.content?.sha });
  }

  if (body.action === "add-comment") {
    const highlightId = typeof body.highlightId === "string" ? body.highlightId : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!highlightId || !text) {
      return NextResponse.json(
        { error: "highlightId e text sono obbligatori" },
        { status: 400 }
      );
    }
    const comment = {
      id: randomUUID(),
      highlightId,
      author: auth.session.user?.name ?? auth.session.user?.email ?? "Autore",
      authorType: "user" as const,
      text,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    const comments = await appendComment(
      auth.octokit,
      owner,
      repo,
      mdPath,
      comment,
      branch
    );
    return NextResponse.json({ comments });
  }

  if (body.action === "delete-comment") {
    const commentId = typeof body.commentId === "string" ? body.commentId : "";
    if (!commentId) {
      return NextResponse.json({ error: "commentId è obbligatorio" }, { status: 400 });
    }
    const comments = await removeComment(
      auth.octokit,
      owner,
      repo,
      mdPath,
      commentId,
      branch
    );
    return NextResponse.json({ comments });
  }

  return NextResponse.json({ error: "action non valida" }, { status: 400 });
}
