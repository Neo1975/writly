"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { useOnline } from "@/components/ui/PwaSetup";
import { DRAFTS_EVENT, listDrafts, type DraftEntry } from "@/lib/client/drafts";
import { browserSyncIO, chapterPage, syncAll, type SyncOutcome, type SyncResult } from "@/lib/client/sync";

const OUTCOME_LABEL: Record<SyncOutcome, string> = {
  salvato: "Salvato su GitHub",
  "gia-allineato": "Già uguale a GitHub",
  conflitto: "Su GitHub è cambiato: aprilo per unire",
  assente: "Non c'è più su GitHub",
  rete: "Senza rete: si riprova più tardi",
  errore: "Non riuscito",
};

const entryId = (e: DraftEntry) => `${e.owner}/${e.repo}/${e.path}@${e.variant ?? ""}`;
const formatTime = (ms: number) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ms);
const chapterName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "").replace(/-/g, " ");
const workName = (path: string) => path.split("/")[1]?.replace(/-/g, " ") ?? "";

/** Il capitolo aperto in questo momento in un editor: lo salva l'editor, non l'allineamento in sottofondo. */
function isOpenHere(e: DraftEntry): boolean {
  return window.location.pathname === chapterPage(e);
}

/**
 * Modifiche scritte ma non ancora su GitHub (per esempio senza rete): l'elenco, e il salvataggio
 * automatico quando la rete c'è. Nelle bozze che su GitHub sono cambiate non si scrive mai:
 * restano per il confronto e l'unione nell'editor.
 */
export default function SyncStatus() {
  const online = useOnline();
  const [pending, setPending] = useState<DraftEntry[]>([]);
  const [results, setResults] = useState<Map<string, SyncResult>>(new Map());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => setPending(await listDrafts()), []);

  const run = useCallback(
    async () => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      try {
        const entries = await listDrafts();
        const done = await syncAll(entries, browserSyncIO, isOpenHere);
        setResults((prev) => {
          const next = new Map(prev);
          for (const r of done) next.set(entryId(r.entry), r);
          return next;
        });
        const saved = done.filter((r) => r.outcome === "salvato").length;
        if (saved > 0) setFlash(`${saved === 1 ? "Una modifica salvata" : `${saved} modifiche salvate`} su GitHub.`);
      } finally {
        running.current = false;
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  // Elenco aggiornato mentre si scrive (le bozze cambiano di continuo: si raggruppa).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 600);
    };
    let cancelled = false;
    listDrafts().then((list) => !cancelled && setPending(list));
    window.addEventListener(DRAFTS_EVENT, onChange);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(DRAFTS_EVENT, onChange);
    };
  }, [refresh]);

  // Con la rete, all'apertura, al ritorno della rete e quando l'app torna in primo piano (iPad): si allinea da sola.
  useEffect(() => {
    if (!online) return;
    void run();
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [online, run]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  if (pending.length === 0 && !flash && !busy) return null;
  const projects = [...new Set(pending.map((e) => `${e.owner}/${e.repo}`))];

  return (
    <>
      {pending.length > 0 ? (
        <button type="button" className="btn btn-small sync-badge" onClick={() => setOpen(true)} aria-haspopup="dialog">
          {busy ? "Salvo…" : `${pending.length} ${pending.length === 1 ? "modifica non ancora su GitHub" : "modifiche non ancora su GitHub"}`}
        </button>
      ) : (
        <span className="small muted" role="status">
          {busy ? "Salvo…" : flash}
        </span>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Modifiche non ancora su GitHub" wide>
        {pending.length === 0 ? (
          <p>Tutto salvato su GitHub.</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {online
                ? "Sono testi scritti in questo dispositivo che non sono ancora una versione su GitHub. Con la rete si salvano da soli; il capitolo aperto in un editor lo salvi da lì."
                : "Sei senza rete: quando torna, si salvano da sole come nuove versioni. Intanto restano al sicuro in questo dispositivo."}
            </p>
            {projects.map((p) => (
              <section key={p} style={{ marginBottom: 12 }}>
                <h3 className="small" style={{ margin: "0 0 6px" }}>
                  {p}
                </h3>
                <ul className="list">
                  {pending
                    .filter((e) => `${e.owner}/${e.repo}` === p)
                    .map((e) => {
                      const result = results.get(entryId(e));
                      const here = typeof window !== "undefined" && isOpenHere(e);
                      return (
                        <li key={entryId(e)} style={{ flexWrap: "wrap", gap: "4px 12px" }}>
                          <Link href={`${chapterPage(e)}${e.variant ? `?variante=${encodeURIComponent(e.variant.replace(/^variante\//, ""))}` : ""}`} onClick={() => setOpen(false)}>
                            {workName(e.path)} · {chapterName(e.path)}
                            {e.variant ? ` (${e.variant.replace(/^variante\//, "")})` : ""}
                          </Link>
                          <span className="small muted">modificato il {formatTime(e.draft.updatedAt)}</span>
                          {result && result.outcome !== "salvato" && (
                            <span className="small" style={{ color: result.outcome === "conflitto" || result.outcome === "errore" ? "var(--danger)" : undefined }}>
                              {OUTCOME_LABEL[result.outcome]}
                              {result.message ? `: ${result.message}` : ""}
                            </span>
                          )}
                          {here && <span className="small muted">aperto nell&apos;editor</span>}
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={!online || busy} onClick={() => void run()}>
                {busy ? "Salvo…" : "Salva tutto in versione"}
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Chiudi
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
