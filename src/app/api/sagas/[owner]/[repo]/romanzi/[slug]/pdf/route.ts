import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { getFile } from "@/lib/github";
import { parseJsonBody } from "@/lib/api-request";
import { getChapterContents, isSafeSlug, listCapitoli } from "@/lib/domain";
import { buildBookPdf } from "@/lib/pdf/document";
import { imposeBooklet } from "@/lib/pdf/booklet";
import { slugify } from "@/lib/templates";
import type { PdfSettings, Romanzo } from "@/lib/types";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  if (!isSafeSlug(slug)) {
    return NextResponse.json({ error: "Slug non valido" }, { status: 400 });
  }
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ error: "settings è obbligatorio" }, { status: 400 });
  }
  const settings = body.settings as PdfSettings;
  const booklet = body.mode === "booklet";

  const romanzoFile = await getFile(
    auth.octokit,
    owner,
    repo,
    `romanzi/${slug}/romanzo.json`,
    branch
  );
  if (!romanzoFile) {
    return NextResponse.json({ error: "Romanzo non trovato" }, { status: 404 });
  }
  const romanzo = JSON.parse(romanzoFile.content) as Romanzo;

  const allCapitoli = await listCapitoli(auth.octokit, owner, repo, slug, branch);
  const selected = settings.chapterFiles?.length
    ? allCapitoli.filter((c) => settings.chapterFiles!.includes(c.file))
    : allCapitoli;

  if (selected.length === 0) {
    return NextResponse.json(
      { error: "Nessun capitolo da esportare" },
      { status: 400 }
    );
  }

  const contents = await getChapterContents(
    auth.octokit,
    owner,
    repo,
    slug,
    selected.map((c) => c.file),
    branch
  );
  const contentByFile = new Map(contents.map((c) => [c.file, c.content]));

  const chapters = selected.map((c) => ({
    file: c.file,
    title: c.title,
    content: contentByFile.get(c.file) ?? "",
  }));

  const effectiveSettings: PdfSettings = booklet
    ? { ...settings, pageSize: "A5" }
    : settings;

  const contentPdf = await buildBookPdf({
    sagaTitle: repo,
    romanzoTitle: romanzo.title,
    settings: effectiveSettings,
    chapters,
  });

  const finalPdf = booklet ? await imposeBooklet(contentPdf) : contentPdf;
  const suffix = booklet ? "-opuscolo" : "";
  const filename = `${slugify(romanzo.title)}${suffix}.pdf`;

  return new NextResponse(Buffer.from(finalPdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
