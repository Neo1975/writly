import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import { mergeBranches } from "@/lib/github";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { owner, repo } = await params;

  const body = await parseJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const base = typeof body.base === "string" ? body.base.trim() : "";
  const head = typeof body.head === "string" ? body.head.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : undefined;

  if (!base || !head) {
    return NextResponse.json(
      { error: "base e head sono obbligatori" },
      { status: 400 }
    );
  }
  if (base === head) {
    return NextResponse.json(
      { error: "I due branch devono essere diversi" },
      { status: 400 }
    );
  }

  const result = await mergeBranches(auth.octokit, owner, repo, base, head, message);

  if (result.status === "conflict") {
    return NextResponse.json(
      {
        error:
          "Conflitto durante il merge: risolvilo manualmente su GitHub o in locale.",
        status: "conflict",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ status: result.status, sha: result.sha });
}
