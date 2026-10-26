import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { putFile } from "@/lib/github";
import { listRomanzi } from "@/lib/domain";
import { emptyJsonArray, romanzoJsonTemplate, slugify } from "@/lib/templates";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;
  const romanzi = await listRomanzi(auth.octokit, owner, repo);
  return NextResponse.json({ romanzi });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;

  const body = await request.json();
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

  const existing = await listRomanzi(auth.octokit, owner, repo);
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
    `Crea romanzo "${title}"`
  );
  await putFile(
    auth.octokit,
    owner,
    repo,
    `romanzi/${slug}/scene/scene.json`,
    emptyJsonArray(),
    "Inizializza architettura scene"
  );

  return NextResponse.json(
    { slug, title, order, description, status: "bozza" },
    { status: 201 }
  );
}
