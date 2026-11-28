import { NextResponse } from "next/server";
import { WORK_INFO_MAX } from "@/lib/project/format";
import { isChapterFile, isSlug } from "@/lib/project/paths";
import { ApiError, assertRepoRef, readJson, requireText, withGitHub } from "@/lib/server/http";
import {
  addArc,
  addChapter,
  addDictionaryWord,
  addWork,
  installMentor,
  loadProject,
  moveChaptersToArc,
  removeArc,
  renameChapter,
  updateArc,
  updateWorkInfo,
  updateWorkSettings,
} from "@/lib/server/projects";

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

function optionalArcId(body: Record<string, unknown>, key = "arco"): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !isSlug(v)) throw new ApiError(400, "Arco non valido.");
  return v;
}

function requireArcId(body: Record<string, unknown>): string {
  const id = optionalArcId(body);
  if (!id) throw new ApiError(400, "Arco non valido.");
  return id;
}

const MAX_WORDS = 100_000;

/** Lunghezza voluta del capitolo: null o assente = nessun obiettivo. */
function readWordRange(body: Record<string, unknown>) {
  const v = body.paroleCapitolo;
  if (v === undefined || v === null) return null;
  const { min, max } = (typeof v === "object" ? v : {}) as { min?: unknown; max?: unknown };
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_WORDS;
  if (!ok(min) || !ok(max) || max < min) throw new ApiError(400, "Lunghezza dei capitoli: indica un minimo e un massimo in parole, con il massimo non inferiore al minimo.");
  return { min, max };
}

function noteText(body: Record<string, unknown>, key: string, label: string): string {
  const v = body[key] ?? "";
  if (typeof v !== "string" || v.length > WORK_INFO_MAX) throw new ApiError(400, `${label}: al massimo ${WORK_INFO_MAX} caratteri.`);
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
        const file = await addChapter(gh, owner, repo, requireSlug(body, "opera"), requireText(body, "titolo", "Titolo del capitolo"), optionalArcId(body));
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
      case "info-opera": {
        const testo = (key: string) => {
          const v = body[key] ?? "";
          if (typeof v !== "string" || v.length > WORK_INFO_MAX) throw new ApiError(400, `${key === "tema" ? "Tema" : "Premessa"}: al massimo ${WORK_INFO_MAX} caratteri.`);
          return v;
        };
        await updateWorkInfo(gh, owner, repo, requireSlug(body, "opera"), { tema: testo("tema"), premessa: testo("premessa") });
        return NextResponse.json({ ok: true });
      }
      case "impostazioni-opera": {
        await updateWorkSettings(gh, owner, repo, requireSlug(body, "opera"), {
          paroleCapitolo: readWordRange(body),
          notaIniziale: noteText(body, "notaIniziale", "Nota iniziale"),
          notaFinale: noteText(body, "notaFinale", "Nota finale"),
        });
        return NextResponse.json({ ok: true });
      }
      case "arco-nuovo": {
        const id = await addArc(gh, owner, repo, requireSlug(body, "opera"), requireText(body, "titolo", "Titolo dell'arco", 120));
        return NextResponse.json({ id }, { status: 201 });
      }
      case "arco-modifica": {
        const changes: { titolo?: string; sintesi?: string; chiuso?: boolean } = {};
        if (body.titolo !== undefined) changes.titolo = requireText(body, "titolo", "Titolo dell'arco", 120);
        if (body.sintesi !== undefined) changes.sintesi = noteText(body, "sintesi", "Sintesi dell'arco");
        if (body.chiuso !== undefined) {
          if (typeof body.chiuso !== "boolean") throw new ApiError(400, "Stato dell'arco non valido.");
          changes.chiuso = body.chiuso;
        }
        await updateArc(gh, owner, repo, requireSlug(body, "opera"), requireArcId(body), changes);
        return NextResponse.json({ ok: true });
      }
      case "arco-elimina": {
        await removeArc(gh, owner, repo, requireSlug(body, "opera"), requireArcId(body));
        return NextResponse.json({ ok: true });
      }
      case "capitolo-arco": {
        // Un capitolo («file») o più insieme («files», al massimo 500).
        const files = Array.isArray(body.files) ? body.files : [body.file];
        if (files.length === 0 || files.length > 500 || !files.every((f): f is string => typeof f === "string" && isChapterFile(f))) throw new ApiError(400, "Capitolo non valido.");
        await moveChaptersToArc(gh, owner, repo, requireSlug(body, "opera"), files, optionalArcId(body) ?? null);
        return NextResponse.json({ ok: true });
      }
      case "installa-mentore":
        return NextResponse.json({ versione: await installMentor(gh, owner, repo) });
      default:
        throw new ApiError(400, "Azione non riconosciuta.");
    }
  });
}
