import { NextResponse } from "next/server";
import { isChapterFile, isSlug } from "@/lib/project/paths";
import { ApiError, assertRepoRef, readJson, requireText, withGitHub } from "@/lib/server/http";
import { addChapter, addDictionaryWord, addWork, loadProject, renameChapter, installMentor } from "@/lib/server/projects";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    return NextResponse.json(await loadProject(gh, owner, repo));
  });
}

function requireSlug(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || !isSlug(v)) throw new ApiError(400, "Opera non valida.");
  return v;
}

export async function POST(req: Request, { params }: Ctx) {
  const { owner, repo } = await params;
  return withGitHub(req, async (gh) => {
    assertRepoRef(owner, repo);
    const body = await readJson(req);

    switch (body.azione) {
      case "nuova-opera": {
        const opera = await addWork(gh, owner, repo, requireText(body, "titolo", "Titolo dell'opera"));
        return NextResponse.json({ opera }, { status: 201 });
      }
      case "nuovo-capitolo": {
        const file = await addChapter(gh, owner, repo, requireSlug(body, "opera"), requireText(body, "titolo", "Titolo del capitolo"));
        return NextResponse.json({ file }, { status: 201 });
      }
      case "rinomina-capitolo": {
        const file = body.file;
        if (typeof file !== "string" || !isChapterFile(file)) throw new ApiError(400, "Capitolo non valido.");
        await renameChapter(gh, owner, repo, requireSlug(body, "opera"), file, requireText(body, "titolo", "Titolo del capitolo"));
        return NextResponse.json({ ok: true });
      }
      case "aggiungi-parola": {
        const parola = requireText(body, "parola", "Parola", 60);
        if (/\s/.test(parola)) throw new ApiError(400, "Una parola alla volta, senza spazi.");
        return NextResponse.json({ dizionario: await addDictionaryWord(gh, owner, repo, parola) });
      }
      case "installa-mentore":
        return NextResponse.json({ versione: await installMentor(gh, owner, repo) });
      default:
        throw new ApiError(400, "Azione non riconosciuta.");
    }
  });
}
