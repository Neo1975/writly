import { NextResponse } from "next/server";
import { requireSessionOctokit } from "@/lib/session-github";
import { parseJsonBody } from "@/lib/api-request";
import {
  createSagaRepo,
  getAuthenticatedUsername,
  listSagas,
  putFile,
} from "@/lib/github";
import { emptyJsonArray, sagaJsonTemplate, slugify } from "@/lib/templates";
import { CHARACTERS_PATH } from "@/lib/domain";
import { editorCommentSkillTemplate } from "@/lib/skill-template";
import { withGithubAuthHandling } from "@/lib/api-error-handler";

export const GET = withGithubAuthHandling(async () => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const username = await getAuthenticatedUsername(auth.octokit);
  const sagas = await listSagas(auth.octokit, username);
  return NextResponse.json({ sagas });
});

export const POST = withGithubAuthHandling(async (request: Request) => {
  const auth = await requireSessionOctokit();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }

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

  const repoName = slugify(title);
  if (!repoName) {
    return NextResponse.json({ error: "titolo non valido" }, { status: 400 });
  }

  try {
    const { owner, repo, htmlUrl } = await createSagaRepo(auth.octokit, {
      name: repoName,
      description,
    });

    await putFile(
      auth.octokit,
      owner,
      repo,
      "saga.json",
      sagaJsonTemplate(title, description),
      "Inizializza saga.json"
    );
    await putFile(
      auth.octokit,
      owner,
      repo,
      ".claude/skills/editor-comment.md",
      editorCommentSkillTemplate(title),
      "Aggiungi skill mentore AI"
    );
    await putFile(
      auth.octokit,
      owner,
      repo,
      CHARACTERS_PATH,
      emptyJsonArray(),
      "Inizializza schede personaggi"
    );

    return NextResponse.json({ owner, repo, title, htmlUrl }, { status: 201 });
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    if (status === 422) {
      return NextResponse.json(
        { error: "Esiste già un repository con questo nome" },
        { status: 409 }
      );
    }
    throw error;
  }
});
