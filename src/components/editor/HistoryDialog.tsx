"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/client/api";
import { parseChapter } from "@/lib/project/format";
import type { CommitSummary } from "@/lib/server/github";
import { formatCount, textStats } from "@/lib/text/stats";

function formatDate(iso: string | null) {
  if (!iso) return "data sconosciuta";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Storico delle versioni salvate (commit) del capitolo, con anteprima e ripristino nell'editor. */
export default function HistoryDialog({
  open,
  onClose,
  base,
  path,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  base: string;
  path: string;
  onRestore: (body: string, when: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Storico delle versioni" wide>
      {open && <HistoryBody base={base} path={path} onClose={onClose} onRestore={onRestore} />}
    </Modal>
  );
}

function HistoryBody({
  base,
  path,
  onClose,
  onRestore,
}: {
  base: string;
  path: string;
  onClose: () => void;
  onRestore: (body: string, when: string) => void;
}) {
  const [commits, setCommits] = useState<CommitSummary[] | null>(null);
  const [selected, setSelected] = useState<CommitSummary | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ commits: CommitSummary[] }>(`${base}/file?path=${encodeURIComponent(path)}&storia=1`)
      .then((r) => setCommits(r.commits))
      .catch((e: Error) => setError(e.message));
  }, [base, path]);

  async function pick(c: CommitSummary) {
    setSelected(c);
    setPreview(null);
    try {
      const r = await api<{ text: string }>(`${base}/file?path=${encodeURIComponent(path)}&ref=${c.sha}`);
      setPreview(parseChapter(r.text).body);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="history">
        <ul className="history-list" aria-label="Versioni salvate">
          {!commits && !error && <li className="muted small">Carico lo storico…</li>}
          {commits?.length === 0 && <li className="muted small">Nessuna versione salvata.</li>}
          {commits?.map((c) => (
            <li key={c.sha}>
              <button type="button" className={`history-item${selected?.sha === c.sha ? " is-selected" : ""}`} onClick={() => void pick(c)} aria-pressed={selected?.sha === c.sha}>
                <span className="history-msg">{c.message.split("\n")[0]}</span>
                <span className="small muted">
                  {formatDate(c.date)} · {c.sha.slice(0, 7)}
                  {c.author ? ` · ${c.author}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="history-preview" aria-live="polite">
          {!selected && <p className="muted">Scegli una versione per vederne il testo.</p>}
          {selected && preview === null && !error && <p className="muted">Carico la versione…</p>}
          {selected && preview !== null && (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>
                {formatCount(textStats(preview).parole)} parole · {formatCount(textStats(preview).battute)} battute
              </p>
              <div className="history-text serif">{preview || "(capitolo vuoto)"}</div>
            </>
          )}
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          Chiudi
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selected || preview === null}
          onClick={() => selected && preview !== null && onRestore(preview, formatDate(selected.date))}
        >
          Ripristina nell&apos;editor
        </button>
      </div>
    </div>
  );
}
