import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { getTimelineEvents, saveTimelineEvents } from "@/lib/domain";
import { isTimelineEvent } from "@/lib/validation";
import type { TimelineEvent } from "@/lib/types";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export const GET = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;
  const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
  const { events } = await getTimelineEvents(auth.octokit, owner, repo, branch);
  return NextResponse.json({ events });
});

export const PUT = withGithubAuthHandling(async (request: Request, { params }: RouteParams) => {
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
  if (!Array.isArray(body.events) || !body.events.every(isTimelineEvent)) {
    return NextResponse.json(
      { error: "events deve essere un array di eventi validi" },
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
});
