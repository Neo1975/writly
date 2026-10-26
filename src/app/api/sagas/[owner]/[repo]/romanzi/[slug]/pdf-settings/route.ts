import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { getPdfSettings, savePdfSettings } from "@/lib/domain";
import type { PdfSettings } from "@/lib/types";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;
  const { settings } = await getPdfSettings(auth.octokit, owner, repo, slug);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo, slug } = await params;

  const body = await request.json();
  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ error: "settings è obbligatorio" }, { status: 400 });
  }
  const settings = body.settings as PdfSettings;
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Aggiorna impostazioni PDF";

  const { sha } = await getPdfSettings(auth.octokit, owner, repo, slug);
  await savePdfSettings(auth.octokit, owner, repo, slug, settings, sha, message);

  return NextResponse.json({ settings });
}
