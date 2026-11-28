"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { projectApi } from "@/lib/client/api";
import { useApiData } from "@/lib/client/hooks";
import { chapterForPlatform, type PlatformFormat } from "@/lib/export/platform";
import { parseChapter } from "@/lib/project/format";
import { chapterPath } from "@/lib/project/paths";
import { slugify } from "@/lib/project/slug";
import type { WorkSummary } from "@/lib/server/projects";
import { countWords, formatCount, markdownToPlain } from "@/lib/text/stats";

const FORMAT_LABEL: Record<PlatformFormat, { label: string; hint: string; mime: string; ext: string }> = {
  html: { label: "HTML", hint: "Mantiene corsivi e grassetti: per gli editor delle piattaforme che accettano il testo formattato (Royal Road, Webnovel…).", mime: "text/html", ext: "html" },
  testo: { label: "Testo semplice", hint: "Senza formattazione, paragrafi separati da una riga vuota: per i campi di solo testo.", mime: "text/plain", ext: "txt" },
};

/** Un capitolo alla volta, pronto da incollare nelle piattaforme di pubblicazione a puntate. */
export default function PlatformExport({ owner, repo, work, defaultOpen }: { owner: string; repo: string; work: WorkSummary; defaultOpen: boolean }) {
  const base = projectApi(owner, repo);
  const [file, setFile] = useState(work.capitoli[0]?.file ?? "");
  const [formato, setFormato] = useState<PlatformFormat>("html");
  const [conTitolo, setConTitolo] = useState(false);
  const [conNote, setConNote] = useState(true);
  const [copied, setCopied] = useState<"ok" | "errore" | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const index = Math.max(0, work.capitoli.findIndex((c) => c.file === file));
  const chapter = work.capitoli[index];
  const remote = useApiData<{ text: string; sha: string }>(chapter ? `${base}/file?path=${encodeURIComponent(chapterPath(work.slug, chapter.file))}` : null);

  const hasNotes = !!(work.notaIniziale || work.notaFinale);
  const build = (f: PlatformFormat) =>
    chapterForPlatform(
      { titolo: chapter.titolo, markdown: parseChapter(remote.data!.text).body, conTitolo, ...(conNote ? { notaIniziale: work.notaIniziale, notaFinale: work.notaFinale } : {}) },
      f,
    );
  const output = useMemo(
    () => (remote.data && chapter ? chapterForPlatform({ titolo: chapter.titolo, markdown: parseChapter(remote.data.text).body, conTitolo, ...(conNote ? { notaIniziale: work.notaIniziale, notaFinale: work.notaFinale } : {}) }, formato) : ""),
    [remote.data, chapter, conTitolo, conNote, formato, work.notaIniziale, work.notaFinale],
  );
  const words = useMemo(() => (remote.data ? countWords(markdownToPlain(parseChapter(remote.data.text).body)) : 0), [remote.data]);
  const downloadUrl = useMemo(() => (output ? URL.createObjectURL(new Blob([output], { type: `${FORMAT_LABEL[formato].mime};charset=utf-8` })) : null), [output, formato]);

  function pick(next: string) {
    setFile(next);
    setCopied(null);
  }

  async function copy() {
    setCopied(null);
    try {
      if (formato === "html" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // Testo formattato: incollando in un editor visuale restano corsivi e grassetti.
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([output], { type: "text/html" }), "text/plain": new Blob([build("testo")], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(output);
      }
      setCopied("ok");
    } catch {
      // Appunti non disponibili (permessi, connessione non sicura): si seleziona il testo per copiarlo a mano.
      area.current?.focus();
      area.current?.select();
      setCopied("errore");
    }
  }

  if (work.capitoli.length === 0) return null;
  const fileName = `${slugify(`${index + 1} ${chapter.titolo}`)}.${FORMAT_LABEL[formato].ext}`;
  return (
    <details className="card" open={defaultOpen}>
      <summary className="h2" style={{ cursor: "pointer", fontWeight: 600 }}>
        Per le piattaforme web
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Un capitolo alla volta, pronto da incollare su Royal Road, Wattpad, Webnovel e simili. Usa l&apos;ultima versione salvata su GitHub.
        </p>
        <div className="row">
          <button type="button" className="btn btn-small" disabled={index <= 0} onClick={() => pick(work.capitoli[index - 1].file)} aria-label="Capitolo precedente">
            ←
          </button>
          <label htmlFor="plat-cap" className="sr-only">
            Capitolo da incollare
          </label>
          <select id="plat-cap" className="select" style={{ flex: "1 1 240px", width: "auto" }} value={chapter.file} onChange={(e) => pick(e.target.value)}>
            {work.capitoli.map((c, i) => (
              <option key={c.file} value={c.file}>
                {i + 1}. {c.titolo}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-small" disabled={index >= work.capitoli.length - 1} onClick={() => pick(work.capitoli[index + 1].file)} aria-label="Capitolo successivo">
            →
          </button>
        </div>
        <fieldset className="fieldset">
          <legend>Formato</legend>
          <div className="row">
            {(Object.keys(FORMAT_LABEL) as PlatformFormat[]).map((f) => (
              <label key={f} className="chip-check">
                <input
                  type="radio"
                  name="plat-formato"
                  checked={formato === f}
                  onChange={() => {
                    setFormato(f);
                    setCopied(null);
                  }}
                />
                {FORMAT_LABEL[f].label}
              </label>
            ))}
          </div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            {FORMAT_LABEL[formato].hint}
          </p>
        </fieldset>
        <div className="row">
          <label className="chip-check">
            <input type="checkbox" checked={conTitolo} onChange={(e) => setConTitolo(e.target.checked)} />
            Titolo in testa
          </label>
          <label className="chip-check">
            <input type="checkbox" checked={conNote} onChange={(e) => setConNote(e.target.checked)} disabled={!hasNotes} />
            Note dell&apos;autore
          </label>
          <Link className="small" href={`/progetto/${owner}/${repo}`}>
            {hasNotes ? "Modifica le note" : "Imposta le note"}
          </Link>
        </div>
        {remote.error && (
          <div className="notice notice-error" role="alert">
            {remote.error.message}
          </div>
        )}
        {remote.loading && <p className="muted">Leggo il capitolo…</p>}
        {remote.data && (
          <>
            <label htmlFor="plat-out" className="small muted">
              {formatCount(words)} parole · anteprima di ciò che si copia
            </label>
            <textarea id="plat-out" ref={area} className="textarea" rows={12} readOnly value={output} />
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => void copy()}>
                Copia
              </button>
              {downloadUrl && (
                <a className="btn" href={downloadUrl} download={fileName}>
                  Scarica il file
                </a>
              )}
              {copied === "ok" && (
                <span className="small" role="status">
                  Copiato: ora incolla nell&apos;editor della piattaforma.
                </span>
              )}
              {copied === "errore" && (
                <span className="small" role="alert">
                  Non riesco a copiare da solo: il testo è selezionato, copialo con Ctrl+C.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
