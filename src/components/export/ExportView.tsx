"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProjectNav from "@/components/project/ProjectNav";
import Modal from "@/components/ui/Modal";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import { useApiData } from "@/lib/client/hooks";
import { SHEET_SIZES, type DuplexFlip, type Imposition, type SheetSize } from "@/lib/export/imposition";
import { BUILTIN_PDF_TEMPLATES, PAGE_FORMATS, type PdfTemplate } from "@/lib/export/template";
import { parseChapter } from "@/lib/project/format";
import { chapterPath } from "@/lib/project/paths";
import { slugify } from "@/lib/project/slug";
import { formatCount } from "@/lib/text/stats";
import type { ProjectData } from "@/lib/server/projects";
import type { Sheet, SheetsData } from "@/lib/server/sheets";
import PlatformExport from "./PlatformExport";
import TemplateEditor from "./TemplateEditor";

type Scope = "opera" | "selezione" | "capitolo";
type Format = "pdf" | "epub" | "docx";

const FORMAT_INFO: Record<Format, { label: string; hint: string; mime: string }> = {
  pdf: { label: "PDF", hint: "Impaginato per la stampa, con template e opuscolo.", mime: "application/pdf" },
  epub: { label: "EPUB", hint: "Ebook per Kobo, Apple Libri, Kindle (con Send to Kindle) e i lettori sul telefono.", mime: "application/epub+zip" },
  docx: { label: "Word (DOCX)", hint: "Dattiloscritto da inviare a editori, agenzie e concorsi: Times 12, interlinea 1,5, capitoli a pagina nuova.", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};

interface FileResult {
  url: string;
  fileName: string;
  format: Exclude<Format, "pdf">;
  bytes: number;
}

interface Result {
  url: string;
  bookletUrl: string | null;
  pages: number;
  imposition: Imposition | null;
  fileName: string;
}

function readPrefs(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Esportazione in PDF: capitolo, selezione o opera intera; template; opuscolo per la stampa fronte/retro. */
export default function ExportView({ owner, repo }: { owner: string; repo: string }) {
  const base = projectApi(owner, repo);
  const project = useApiData<ProjectData>(base);
  const sheets = useApiData<SheetsData>(`${base}/schede`);
  const prefsKey = `writly:export:${owner}/${repo}`;

  const [opera, setOpera] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("opera");
  const [chosen, setChosen] = useState<string[]>([]);
  const [single, setSingle] = useState("");
  const [templateKey, setTemplateKey] = useState("romanzo-14x21");
  const [autore, setAutore] = useState("");
  const [sottotitolo, setSottotitolo] = useState("");
  const [bozza, setBozza] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"pdf" | "opuscolo">("pdf");
  const [foglio, setFoglio] = useState<SheetSize>("A4");
  const [flip, setFlip] = useState<DuplexFlip>("corto");
  const [segnatura, setSegnatura] = useState(0);
  const [creep, setCreep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [formato, setFormato] = useState<Format>("pdf");
  const [fileResult, setFileResult] = useState<FileResult | null>(null);
  const [editing, setEditing] = useState<{ template: PdfTemplate; sheet: Sheet<PdfTemplate> | null } | null>(null);
  const urls = useRef<string[]>([]);

  // Autore e template ricordati per progetto (solo in questo browser).
  useEffect(() => {
    const p = readPrefs(prefsKey);
    const t = setTimeout(() => {
      if (p.autore) setAutore(p.autore);
      if (p.template) setTemplateKey(p.template);
    }, 0);
    return () => clearTimeout(t);
  }, [prefsKey]);
  useEffect(() => {
    try {
      localStorage.setItem(prefsKey, JSON.stringify({ autore, template: templateKey }));
    } catch {
      // niente da fare
    }
  }, [prefsKey, autore, templateKey]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const own = useMemo(() => sheets.data?.templatePdf ?? [], [sheets.data]);
  const allTemplates = useMemo(
    () => [...BUILTIN_PDF_TEMPLATES.map((t) => ({ key: t.id, template: t, sheet: null as Sheet<PdfTemplate> | null })), ...own.map((s) => ({ key: s.path, template: s.data, sheet: s }))],
    [own],
  );
  const current = allTemplates.find((t) => t.key === templateKey) ?? allTemplates[0];

  const nav = <ProjectNav owner={owner} repo={repo} title={project.data?.manifest.titolo ?? "Progetto"} current="esporta" />;
  const loadError = project.error ?? sheets.error;
  if (loadError) {
    return (
      <main className="page">
        {nav}
        <div className="notice notice-error" role="alert">
          {loadError.message}
        </div>
      </main>
    );
  }
  if (!project.data || !sheets.data) {
    return (
      <main className="page">
        {nav}
        <p className="muted">Carico il progetto…</p>
      </main>
    );
  }

  const works = project.data.opere;
  const work = works.find((w) => w.slug === opera) ?? works[0];
  const chapters = work?.capitoli ?? [];
  const selected =
    scope === "opera" ? chapters : scope === "selezione" ? chapters.filter((c) => chosen.includes(c.file)) : chapters.filter((c) => c.file === (single || chapters[0]?.file));

  async function generate() {
    if (!work || selected.length === 0) return;
    setError("");
    setResult(null);
    setFileResult(null);
    try {
      setBusy("Leggo i capitoli da GitHub…");
      const texts = await Promise.all(
        selected.map((c) => api<{ text: string }>(`${base}/file?path=${encodeURIComponent(chapterPath(work.slug, c.file))}`)),
      );
      if (formato !== "pdf") {
        setBusy(`Compongo il file ${FORMAT_INFO[formato].label}…`);
        const { buildDocx, buildEpub } = await import("@/lib/export/ebook");
        const singleChapter = scope === "capitolo";
        const book = { titolo: work.titolo, sottotitolo, autore, lingua: project.data?.manifest.lingua ?? "it" };
        const chs = selected.map((c, i) => ({ titolo: c.titolo, markdown: parseChapter(texts[i].text).body }));
        const bytes = formato === "epub" ? buildEpub(book, chs, { id: `urn:uuid:${crypto.randomUUID()}` }) : buildDocx(book, chs, { titlePage: !singleChapter });
        urls.current.forEach((u) => URL.revokeObjectURL(u));
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: FORMAT_INFO[formato].mime }));
        urls.current = [url];
        setFileResult({ url, format: formato, bytes: bytes.length, fileName: slugify(singleChapter ? `${work.titolo} ${selected[0].titolo}` : work.titolo) });
        return;
      }
      const { renderBook } = await import("@/lib/export/render");
      const template = { ...current.template, ...(bozza === null ? {} : { filigrana: bozza }) };
      const singleChapter = scope === "capitolo";
      const out = await renderBook(
        singleChapter ? { ...template, frontespizio: false, indice: false } : template,
        { titolo: work.titolo, sottotitolo, autore },
        selected.map((c, i) => ({ titolo: c.titolo, numero: chapters.indexOf(c) + 1 || i + 1, markdown: parseChapter(texts[i].text).body })),
        mode === "opuscolo" ? { foglio, fronteRetro: flip, fogliPerSegnatura: segnatura, creep } : null,
        setBusy,
      );
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      const url = URL.createObjectURL(new Blob([out.pdf as BlobPart], { type: "application/pdf" }));
      const bookletUrl = out.booklet ? URL.createObjectURL(new Blob([out.booklet.pdf as BlobPart], { type: "application/pdf" })) : null;
      urls.current = [url, ...(bookletUrl ? [bookletUrl] : [])];
      const name = slugify(singleChapter ? `${work.titolo} ${selected[0].titolo}` : work.titolo);
      setResult({ url, bookletUrl, pages: out.pages, imposition: out.booklet?.imposition ?? null, fileName: name });
    } catch (err) {
      setError((err as Error).message || "Non sono riuscito a generare il PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function saveTemplate(t: PdfTemplate, asNew: boolean, sheet: Sheet<PdfTemplate> | null): Promise<string | null> {
    try {
      const res = await api<Sheet<PdfTemplate>>(`${base}/schede`, {
        method: "POST",
        json: { azione: "template-pdf", ...(asNew || !sheet ? {} : { path: sheet.path, sha: sheet.sha }), data: t },
      });
      sheets.set({ ...sheets.data!, templatePdf: [...own.filter((s) => s.path !== res.path), res].sort((a, b) => a.data.nome.localeCompare(b.data.nome, "it")) });
      setTemplateKey(res.path);
      setEditing(null);
      return null;
    } catch (err) {
      const e = err as ClientApiError;
      return e.status === 409 ? "Il template è cambiato su GitHub nel frattempo: ricarica la pagina." : e.message;
    }
  }

  async function deleteTemplate(sheet: Sheet<PdfTemplate>) {
    if (!window.confirm(`Eliminare il template «${sheet.data.nome}»?`)) return;
    try {
      await api(`${base}/schede`, { method: "POST", json: { azione: "elimina", path: sheet.path, sha: sheet.sha } });
      sheets.set({ ...sheets.data!, templatePdf: own.filter((s) => s.path !== sheet.path) });
      setTemplateKey(BUILTIN_PDF_TEMPLATES[0].id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const t = current.template;
  return (
    <main className="page page-wide">
      {nav}
      <div className="page-head">
        <div>
          <h1>Esporta</h1>
          <div className="small muted">Il file si compone in questo browser con l&apos;ultima versione salvata di ogni capitolo: le modifiche non ancora in versione non sono incluse.</div>
        </div>
      </div>

      {work && <PlatformExport key={work.slug} owner={owner} repo={repo} work={work} defaultOpen={project.data.manifest.tipo === "webnovel"} />}

      <div className="export-grid">
        <div className="stack">
          <section className="card stack" aria-labelledby="exp-cosa">
            <h2 id="exp-cosa" className="h2" style={{ margin: 0 }}>
              Cosa
            </h2>
            <div className="segmented" role="radiogroup" aria-label="Formato del file">
              {(Object.keys(FORMAT_INFO) as Format[]).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)}>
                  {FORMAT_INFO[f].label}
                </button>
              ))}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {FORMAT_INFO[formato].hint}
            </p>
            {works.length > 1 && (
              <div className="field">
                <label htmlFor="exp-opera">Opera</label>
                <select id="exp-opera" className="select" value={work?.slug} onChange={(e) => setOpera(e.target.value)}>
                  {works.map((w) => (
                    <option key={w.slug} value={w.slug}>
                      {w.titolo}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="segmented" role="radiogroup" aria-label="Cosa esportare">
              {(
                [
                  ["opera", "Opera intera"],
                  ["selezione", "Capitoli scelti"],
                  ["capitolo", "Un capitolo"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={scope === id} onClick={() => setScope(id)}>
                  {label}
                </button>
              ))}
            </div>
            {scope === "selezione" && (
              <fieldset className="fieldset">
                <legend>Capitoli</legend>
                <div className="chips">
                  {chapters.map((c, i) => (
                    <label key={c.file} className="chip-check">
                      <input type="checkbox" checked={chosen.includes(c.file)} onChange={(e) => setChosen(e.target.checked ? [...chosen, c.file] : chosen.filter((f) => f !== c.file))} />
                      {i + 1}. {c.titolo}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {scope === "capitolo" && (
              <div className="field">
                <label htmlFor="exp-cap">Capitolo</label>
                <select id="exp-cap" className="select" value={single || chapters[0]?.file} onChange={(e) => setSingle(e.target.value)}>
                  {chapters.map((c, i) => (
                    <option key={c.file} value={c.file}>
                      {i + 1}. {c.titolo}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scope !== "capitolo" && (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="exp-autore">Autore</label>
                  <input id="exp-autore" className="input" maxLength={200} value={autore} onChange={(e) => setAutore(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="exp-sotto">Sottotitolo</label>
                  <input id="exp-sotto" className="input" maxLength={200} value={sottotitolo} onChange={(e) => setSottotitolo(e.target.value)} />
                </div>
              </div>
            )}
          </section>

          {formato === "pdf" && (
            <section className="card stack" aria-labelledby="exp-come">
              <h2 id="exp-come" className="h2" style={{ margin: 0 }}>
                Template
              </h2>
              <div className="row">
                <label htmlFor="exp-template" className="sr-only">
                  Template
                </label>
                <select id="exp-template" className="select" style={{ flex: "1 1 220px", width: "auto" }} value={current.key} onChange={(e) => setTemplateKey(e.target.value)}>
                  <optgroup label="Predefiniti">
                    {BUILTIN_PDF_TEMPLATES.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </optgroup>
                  {own.length > 0 && (
                    <optgroup label="Del progetto">
                      {own.map((s) => (
                        <option key={s.path} value={s.path}>
                          {s.data.nome}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button type="button" className="btn btn-small" onClick={() => setEditing({ template: current.sheet ? current.template : { ...current.template, nome: `${current.template.nome} (copia)` }, sheet: current.sheet })}>
                  {current.sheet ? "Modifica" : "Duplica e modifica"}
                </button>
                {current.sheet && (
                  <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => deleteTemplate(current.sheet!)}>
                    Elimina
                  </button>
                )}
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {PAGE_FORMATS[t.pagina.formato].nome === "Personalizzato" ? `${t.pagina.larghezza}×${t.pagina.altezza} mm` : PAGE_FORMATS[t.pagina.formato].nome} · {t.testo.font} {t.testo.corpo} pt, interlinea {t.testo.interlinea} · margini {t.margini.interno}/{t.margini.esterno} mm
                {t.capitoli.aDestra ? " · capitoli a destra" : ""}
                {t.indice ? " · indice" : ""}
              </p>
              <label className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={bozza ?? t.filigrana} onChange={(e) => setBozza(e.target.checked)} />
                Filigrana «BOZZA» su ogni pagina
              </label>
            </section>
          )}

          {formato === "pdf" && (
            <section className="card stack" aria-labelledby="exp-stampa">
              <h2 id="exp-stampa" className="h2" style={{ margin: 0 }}>
                Stampa
              </h2>
              <div className="segmented" role="radiogroup" aria-label="Modalità">
                <button type="button" role="radio" aria-checked={mode === "pdf"} onClick={() => setMode("pdf")}>
                  PDF a pagine singole
                </button>
                <button type="button" role="radio" aria-checked={mode === "opuscolo"} onClick={() => setMode("opuscolo")}>
                  Opuscolo fronte/retro
                </button>
              </div>
              {mode === "opuscolo" && (
                <>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="exp-foglio">Foglio</label>
                      <select id="exp-foglio" className="select" value={foglio} onChange={(e) => setFoglio(e.target.value as SheetSize)}>
                        {(Object.keys(SHEET_SIZES) as SheetSize[]).map((s) => (
                          <option key={s} value={s}>
                            {SHEET_SIZES[s].nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="exp-flip">Fronte/retro</label>
                      <select id="exp-flip" className="select" value={flip} onChange={(e) => setFlip(e.target.value as DuplexFlip)}>
                        <option value="corto">Ribalta sul lato corto</option>
                        <option value="lungo">Ribalta sul lato lungo</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="exp-segn">Fogli per fascicolo</label>
                      <select id="exp-segn" className="select" value={segnatura} onChange={(e) => setSegnatura(Number(e.target.value))}>
                        <option value={0}>Un solo fascicolo</option>
                        {[3, 4, 5, 6, 8].map((n) => (
                          <option key={n} value={n}>
                            {n} fogli ({n * 4} pagine)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="exp-creep">Compensazione del creep</label>
                      <input id="exp-creep" className="input" type="number" min={0} max={5} step={0.1} value={creep} onChange={(e) => setCreep(Math.min(5, Math.max(0, Number(e.target.value) || 0)))} />
                      <span className="hint">mm per il foglio più interno di ogni fascicolo (0 = nessuna).</span>
                    </div>
                  </div>
                  <p className="small muted" style={{ margin: 0 }}>
                    Le pagine vengono riordinate per la piegatura e aggiunte pagine bianche fino a un multiplo di 4. Stampa in fronte/retro, piega i fogli a metà{segnatura ? " fascicolo per fascicolo" : ""}.
                  </p>
                </>
              )}
            </section>
          )}

          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={generate} disabled={!!busy || selected.length === 0}>
            {busy ?? (selected.length === 0 ? "Scegli almeno un capitolo" : `Genera ${formato === "pdf" ? "il PDF" : `il file ${FORMAT_INFO[formato].label}`} (${selected.length} ${selected.length === 1 ? "capitolo" : "capitoli"})`)}
          </button>
        </div>

        <section className="card stack export-preview" aria-label="Anteprima" aria-busy={!!busy}>
          {fileResult ? (
            <div className="stack">
              <p className="small" role="status" style={{ margin: 0 }}>
                File {FORMAT_INFO[fileResult.format].label} pronto · {formatCount(Math.max(1, Math.round(fileResult.bytes / 1024)))} KB
              </p>
              <a className="btn btn-primary" style={{ alignSelf: "flex-start" }} href={fileResult.url} download={`${fileResult.fileName}.${fileResult.format}`}>
                Scarica {fileResult.fileName}.{fileResult.format}
              </a>
              <p className="small muted" style={{ margin: 0 }}>
                {fileResult.format === "epub"
                  ? "Controlla l'ebook in un lettore prima di pubblicarlo: la copertina non è inclusa."
                  : "Si apre con Word, LibreOffice, Pages e Google Documenti. Grassetti, corsivi, citazioni e cambi di scena restano; gli stili si possono cambiare dal programma."}
              </p>
            </div>
          ) : !result ? (
            <p className="muted" style={{ margin: 0 }}>
              {busy ?? "L'anteprima compare qui."}
            </p>
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="small" role="status">
                  <strong>{result.pages}</strong> pagine
                  {result.imposition ? ` · ${result.imposition.sheets.length} fogli${result.imposition.blanks ? ` · ${result.imposition.blanks} pagine bianche aggiunte` : ""}` : ""}
                </span>
                <span className="row">
                  <a className="btn btn-small" href={result.url} download={`${result.fileName}.pdf`}>
                    Scarica PDF
                  </a>
                  {result.bookletUrl && (
                    <a className="btn btn-small btn-primary" href={result.bookletUrl} download={`${result.fileName}-opuscolo.pdf`}>
                      Scarica opuscolo
                    </a>
                  )}
                </span>
              </div>
              {result.imposition && <SheetPreview imposition={result.imposition} />}
              <iframe className="pdf-frame" src={result.bookletUrl ?? result.url} title="Anteprima del PDF" />
            </>
          )}
        </section>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.sheet ? "Modifica template" : "Nuovo template"} wide>
        {editing && (
          <TemplateEditor
            template={editing.template}
            editable={!!editing.sheet}
            onCancel={() => setEditing(null)}
            onSave={(tp, asNew) => saveTemplate(tp, asNew, editing.sheet)}
          />
        )}
      </Modal>
    </main>
  );
}

/** Schema dei primi fogli: quali pagine vanno su fronte e retro. */
function SheetPreview({ imposition }: { imposition: Imposition }) {
  const shown = imposition.sheets.slice(0, 4);
  const label = (n: number | null) => (n === null ? "bianca" : `p. ${n}`);
  return (
    <figure className="sheet-preview" aria-label="Schema dei fogli">
      {shown.map((s) => (
        <div key={`${s.signature}-${s.index}`} className="sheet">
          <div className="small muted">
            {imposition.sheets.some((x) => x.signature > 1) ? `Fascicolo ${s.signature}, ` : ""}foglio {s.index + 1}
          </div>
          <div className="sheet-sides">
            {(["front", "back"] as const).map((side) => (
              <div key={side} className="sheet-side">
                <span className={s[side].left === null ? "is-blank" : ""}>{label(s[side].left)}</span>
                <span className={s[side].right === null ? "is-blank" : ""}>{label(s[side].right)}</span>
                <em>{side === "front" ? "fronte" : "retro"}</em>
              </div>
            ))}
          </div>
        </div>
      ))}
      {imposition.sheets.length > shown.length && <figcaption className="small muted">…e altri {imposition.sheets.length - shown.length} fogli.</figcaption>}
    </figure>
  );
}
