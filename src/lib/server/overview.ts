import { characterAttributesText } from "@/lib/project/entities";
import { parseChapter, parseProjectManifest, parseWorkManifest, type ChapterStatus, type ProjectType } from "@/lib/project/format";
import { MANIFEST_PATH, chapterPath, workManifestPath } from "@/lib/project/paths";
import { continuityWarnings, sheetAttributes } from "@/lib/text/continuity";
import { countMentions, createMentionMatcher } from "@/lib/text/mentions";
import { markdownToPlain, textStats } from "@/lib/text/stats";
import { ApiError } from "./errors";
import { listTree, readBlobs, type GitHub } from "./github";
import { loadSheets } from "./sheets";

/**
 * Panoramica del progetto: parole per capitolo e per opera, presenze di
 * personaggi e voci del mondo capitolo per capitolo (e libro per libro in una
 * saga), schede mai citate, avvisi di continuità. Tutto calcolato sulle versioni
 * salvate su GitHub; non scrive nulla.
 */

export interface OverviewWarning {
  nome: string;
  parte: string;
  trovato: string;
  atteso: string[];
  testo: string;
  frase: string;
}

export interface OverviewChapter {
  file: string;
  titolo: string;
  stato: ChapterStatus | "mancante";
  parole: number;
  battute: number;
  /** id della scheda → numero di citazioni. */
  presenze: Record<string, number>;
  avvisi: OverviewWarning[];
}

export interface OverviewWork {
  slug: string;
  titolo: string;
  obiettivoParole: number | null;
  capitoli: OverviewChapter[];
}

export interface OverviewEntity {
  id: string;
  nome: string;
  tipo: "personaggio" | "voce";
  categoria: string;
}

export interface OverviewData {
  titolo: string;
  tipo: ProjectType;
  opere: OverviewWork[];
  schede: OverviewEntity[];
}

const present = <T,>(x: T | undefined | null): x is T => x !== undefined && x !== null;

export async function loadOverview(gh: GitHub, owner: string, repo: string): Promise<OverviewData> {
  const [tree, sheets] = await Promise.all([listTree(gh, owner, repo), loadSheets(gh, owner, repo)]);
  const byPath = new Map(tree.map((e) => [e.path, e]));
  const manifestEntry = byPath.get(MANIFEST_PATH);
  if (!manifestEntry) throw new ApiError(404, "Questo repository non è un progetto Writly (manca writly.yaml).");
  const [manifestText] = await readBlobs(gh, owner, repo, [manifestEntry]);
  const manifest = parseProjectManifest(manifestText);

  const workEntries = manifest.opere.map((slug) => ({ slug, entry: byPath.get(workManifestPath(slug)) })).filter((x) => present(x.entry));
  const workTexts = await readBlobs(gh, owner, repo, workEntries.map((x) => x.entry!));
  const works = workEntries.map((x, i) => ({ slug: x.slug, ...parseWorkManifest(workTexts[i], x.slug) }));

  const chapterEntries = works.flatMap((work) => work.capitoli.map((c) => byPath.get(chapterPath(work.slug, c.file))).filter(present));
  const chapterTexts = await readBlobs(gh, owner, repo, chapterEntries);
  const textByPath = new Map(chapterEntries.map((e, i) => [e.path, chapterTexts[i]]));

  const matcher = createMentionMatcher([
    ...sheets.personaggi.map((c) => ({ id: c.data.id, names: [c.data.nome, ...c.data.alias] })),
    ...sheets.voci.map((v) => ({ id: v.data.id, names: [v.data.nome, ...v.data.alias] })),
  ]);
  const characters = sheets.personaggi.map((c) => ({ id: c.data.id, nome: c.data.nome, attributi: sheetAttributes(characterAttributesText(c.data)) }));

  const opere: OverviewWork[] = works.map((work) => ({
    slug: work.slug,
    titolo: work.titolo,
    obiettivoParole: work.obiettivoParole ?? null,
    capitoli: work.capitoli.map((c): OverviewChapter => {
      const raw = textByPath.get(chapterPath(work.slug, c.file));
      if (raw === undefined) return { file: c.file, titolo: c.titolo, stato: "mancante", parole: 0, battute: 0, presenze: {}, avvisi: [] };
      const doc = parseChapter(raw);
      const plain = markdownToPlain(doc.body);
      const stats = textStats(plain);
      return {
        file: c.file,
        titolo: c.titolo,
        stato: doc.meta.stato,
        parole: stats.parole,
        battute: stats.battute,
        presenze: Object.fromEntries(countMentions(matcher, plain)),
        avvisi: continuityWarnings(plain, characters, matcher).map(({ nome, parte, trovato, atteso, testo, frase }) => ({ nome, parte, trovato, atteso, testo, frase })),
      };
    }),
  }));

  const categories = new Map(sheets.categorie.items.map((c) => [c.id, c.nome]));
  return {
    titolo: manifest.titolo,
    tipo: manifest.tipo,
    opere,
    schede: [
      ...sheets.personaggi.map((c) => ({ id: c.data.id, nome: c.data.nome, tipo: "personaggio" as const, categoria: "Personaggi" })),
      ...sheets.voci.map((v) => ({ id: v.data.id, nome: v.data.nome, tipo: "voce" as const, categoria: categories.get(v.categoria) ?? v.categoria })),
    ],
  };
}
