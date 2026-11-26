import { NextResponse } from "next/server";
import { PROJECT_TYPES, type ProjectType } from "@/lib/project/format";
import { listRepos } from "@/lib/server/github";
import { ApiError, assertRepoRef, optionalText, readJson, requireText, withGitHub } from "@/lib/server/http";
import { connectProject, createProject } from "@/lib/server/projects";

/** Elenco dei progetti Writly dell'autore e dei repository che può collegare. */
export async function GET(req: Request) {
  return withGitHub(req, async (gh) => {
    const repos = await listRepos(gh);
    return NextResponse.json({
      progetti: repos.filter((r) => r.isProject),
      candidati: repos.filter((r) => !r.isProject && r.canWrite),
    });
  });
}

function readType(body: Record<string, unknown>): ProjectType {
  const tipo = body.tipo;
  if (!PROJECT_TYPES.includes(tipo as ProjectType)) throw new ApiError(400, "Tipo di progetto non valido.");
  return tipo as ProjectType;
}

/** azione "crea": nuovo repository; azione "collega": repository esistente. */
export async function POST(req: Request) {
  return withGitHub(req, async (gh) => {
    const body = await readJson(req);
    const titolo = requireText(body, "titolo", "Titolo");
    const tipo = readType(body);

    if (body.azione === "crea") {
      const nomeRepo = requireText(body, "nomeRepo", "Nome del repository", 90);
      const ref = await createProject(gh, {
        titolo,
        tipo,
        nomeRepo,
        privato: body.privato !== false,
        titoloOpera: optionalText(body, "titoloOpera"),
      });
      return NextResponse.json(ref, { status: 201 });
    }

    if (body.azione === "collega") {
      const owner = requireText(body, "owner", "Proprietario", 39);
      const repo = requireText(body, "repo", "Repository", 100);
      assertRepoRef(owner, repo);
      await connectProject(gh, owner, repo, { titolo, tipo });
      return NextResponse.json({ owner, repo });
    }

    throw new ApiError(400, "Azione non riconosciuta.");
  });
}
