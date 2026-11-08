import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { putFile } from "@/lib/github";
import { listRomanzi } from "@/lib/domain";
import { emptyJsonArray, romanzoJsonTemplate, slugify } from "@/lib/templates";

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
  const romanzi = await listRomanzi(auth.octokit, owner, repo, branch);
  return NextResponse.json({ romanzi });
}

export async function POST(request: Request, { params }: RouteParams) {
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
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title è obbligatorio" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description : undefined;

  const slug = slugify(title);
  if (!slug) {
    return NextResponse.json({ error: "titolo non valido" }, { status: 400 });
  }

  const existing = await listRomanzi(auth.octokit, owner, repo, branch);
  if (existing.some((r) => r.slug === slug)) {
    return NextResponse.json(
      { error: "Esiste già un romanzo con questo nome" },
      { status: 409 }
    );
  }
  const order = existing.length + 1;

  await putFile(
    auth.octokit,
    owner,
    repo,
    `romanzi/${slug}/romanzo.json`,
    romanzoJsonTemplate(title, order, description),
    `Crea romanzo "${title}"`,
    undefined,
    branch
  );
  await putFile(
    auth.octokit,
    owner,
    repo,
    `romanzi/${slug}/scene/scene.json`,
    emptyJsonArray(),
    "Inizializza architettura scene",
    undefined,
    branch
  );

  return NextResponse.json(
    { slug, title, order, description, status: "bozza" },
    { status: 201 }
  );
}
