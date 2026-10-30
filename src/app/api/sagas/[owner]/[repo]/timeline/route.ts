import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { getTimelineEvents, saveTimelineEvents } from "@/lib/domain";
import type { TimelineEvent } from "@/lib/types";

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
  const { events } = await getTimelineEvents(auth.octokit, owner, repo, branch);
  return NextResponse.json({ events });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;

  const body = await request.json();
  if (!Array.isArray(body.events)) {
    return NextResponse.json(
      { error: "events deve essere un array" },
      { status: 400 }
    );
  }
  const events = body.events as TimelineEvent[];
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Aggiorna timeline degli eventi";

  const { sha } = await getTimelineEvents(auth.octokit, owner, repo, branch);
  await saveTimelineEvents(auth.octokit, owner, repo, events, sha, message, branch);

  return NextResponse.json({ events });
}
