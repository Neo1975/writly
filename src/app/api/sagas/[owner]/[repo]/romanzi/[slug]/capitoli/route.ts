import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { putFile } from "@/lib/github";
import { capitoliDirFor, listCapitoli } from "@/lib/domain";
import { chapterTemplate, emptyJsonArray, slugify } from "@/lib/templates";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
  const capitoli = await listCapitoli(auth.octokit, owner, repo, slug, branch);
  return NextResponse.json({ capitoli });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title è obbligatorio" }, { status: 400 });
  }

  const existing = await listCapitoli(auth.octokit, owner, repo, slug, branch);
  const order = existing.length + 1;
  const paddedOrder = String(order).padStart(2, "0");
  const fileName = `${paddedOrder}-${slugify(title)}.md`;
  const dirPath = capitoliDirFor(slug);

  await putFile(
    auth.octokit,
    owner,
    repo,
    `${dirPath}/${fileName}`,
    chapterTemplate(title),
    `Crea capitolo "${title}"`,
    undefined,
    branch
  );
  await putFile(
    auth.octokit,
    owner,
    repo,
    `${dirPath}/${fileName.replace(/\.md$/, ".comments.json")}`,
    emptyJsonArray(),
    "Inizializza commenti capitolo",
    undefined,
    branch
  );

  return NextResponse.json({ file: fileName, title, order }, { status: 201 });
}
