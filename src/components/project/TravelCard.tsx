"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { downloadForTravel, loadTravelInfo, offlineSupported, removeTravelCopy, type DownloadProgress, type TravelInfo } from "@/lib/client/offline";

const formatDate = (ms: number) => new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short" }).format(ms);

/** «Scarica per il viaggio»: copia del progetto sul dispositivo per scrivere i capitoli senza rete. */
export default function TravelCard({ owner, repo, online }: { owner: string; repo: string; online: boolean }) {
  const [info, setInfo] = useState<TravelInfo | null>(null);
  // Sul server si presume di sì; nel browser si controlla davvero.
  const supported = useSyncExternalStore(() => () => {}, offlineSupported, () => true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTravelInfo(owner, repo).then((i) => !cancelled && setInfo(i));
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  async function download() {
    setBusy(true);
    setMessage(null);
    setProgress(null);
    try {
      const done = await downloadForTravel(owner, repo, setProgress);
      setInfo(done);
      setMessage({ kind: "ok", text: `Scaricati ${done.capitoli.length} capitoli: ora puoi aprire e scrivere anche senza rete.` });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove() {
    await removeTravelCopy(owner, repo);
    setInfo(null);
    setMessage(null);
  }

  return (
    <section className="card" aria-labelledby="viaggio-titolo" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 id="viaggio-titolo" className="serif" style={{ margin: 0, fontSize: 20 }}>
        Lavorare senza rete
      </h2>
      {!supported ? (
        <p className="muted" style={{ margin: 0 }}>
          Questo browser non permette di tenere una copia per lavorare senza rete.
        </p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {info
              ? `Copia scaricata il ${formatDate(info.scaricatoIl)}: ${info.capitoli.length} ${info.capitoli.length === 1 ? "capitolo" : "capitoli"}. Si tiene aggiornata quando apri o salvi un capitolo con la rete.`
              : "Scarica il progetto su questo dispositivo (per esempio prima di un viaggio in treno): i capitoli si aprono e si scrivono anche senza rete, e si salvano su GitHub quando torna."}
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={busy || !online}>
              {busy ? "Scarico…" : info ? "Aggiorna la copia" : "Scarica per il viaggio"}
            </button>
            {info && !busy && (
              <button type="button" className="btn" onClick={() => void remove()}>
                Togli dal dispositivo
              </button>
            )}
          </div>
          {!online && !busy && <p className="hint">Serve la rete per scaricare.</p>}
          {busy && progress && (
            <div>
              <progress className="travel-progress" value={progress.fatto} max={progress.totale} aria-label="Avanzamento del download" />
              <span className="small muted">{progress.passo}…</span>
            </div>
          )}
          {message && (
            <div className={`notice ${message.kind === "ok" ? "notice-ok" : "notice-error"}`} role={message.kind === "ok" ? "status" : "alert"}>
              {message.text}
            </div>
          )}
          <p className="hint" style={{ margin: 0 }}>
            Su iPad: tocca Condividi e poi «Aggiungi alla schermata Home», così Writly si apre come un&apos;app a tutto schermo. Nella copia ci sono i capitoli della versione principale; schede, struttura e varianti servono la rete.
          </p>
        </>
      )}
    </section>
  );
}
