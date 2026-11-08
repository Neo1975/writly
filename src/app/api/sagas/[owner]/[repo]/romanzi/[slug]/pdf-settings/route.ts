import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { getPdfSettings, isSafeSlug, savePdfSettings } from "@/lib/domain";
import type { PdfSettings } from "@/lib/types";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  if (!isSafeSlug(slug)) {
    return NextResponse.json({ error: "Slug non valido" }, { status: 400 });
  }
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
  const { settings } = await getPdfSettings(auth.octokit, owner, repo, slug, branch);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request, { params }: RouteParams) {
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
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Aggiorna impostazioni PDF";

  const { sha } = await getPdfSettings(auth.octokit, owner, repo, slug, branch);
  await savePdfSettings(auth.octokit, owner, repo, slug, settings, sha, message, branch);

  return NextResponse.json({ settings });
}
