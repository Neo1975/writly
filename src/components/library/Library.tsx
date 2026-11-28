"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import { api, ClientApiError } from "@/lib/client/api";
import { listTravelProjects, type TravelInfo } from "@/lib/client/offline";
import { PROJECT_TYPES, type ProjectType } from "@/lib/project/format";
import { slugify } from "@/lib/project/slug";
import type { RepoSummary } from "@/lib/server/github";

interface LibraryData {
  progetti: RepoSummary[];
  candidati: RepoSummary[];
}

const TYPE_LABEL: Record<ProjectType, string> = { racconto: "Racconto", romanzo: "Romanzo", saga: "Saga", webnovel: "Web novel (a puntate)" };

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export default function Library() {
  const router = useRouter();
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [dialog, setDialog] = useState<"crea" | "collega" | null>(null);
  // Senza rete: i progetti scaricati su questo dispositivo.
  const [copies, setCopies] = useState<TravelInfo[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<LibraryData>("/api/progetti"));
      setCopies([]);
    } catch (err) {
      setError(err as ClientApiError);
      if ((err as ClientApiError).status === 0) setCopies(await listTravelProjects());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<LibraryData>("/api/progetti")
      .then((d) => !cancelled && setData(d))
      .catch(async (err: ClientApiError) => {
        if (cancelled) return;
        setError(err);
        if (err.status === 0) {
          const found = await listTravelProjects();
          if (!cancelled) setCopies(found);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Quando la rete torna, la libreria si rilegge da sola.
  useEffect(() => {
    const onOnline = () => void load();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  const open = (owner: string, repo: string) => router.push(`/progetto/${owner}/${repo}`);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="small muted">I tuoi progetti di scrittura</div>
          <h1>Libreria</h1>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setDialog("collega")} disabled={!data}>
            Collega repository
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog("crea")}>
            Nuovo progetto
          </button>
        </div>
      </div>

      {error && error.status === 0 && copies.length > 0 && (
        <div className="notice notice-warn" role="status">
          Senza connessione: puoi aprire i progetti scaricati su questo dispositivo.
        </div>
      )}
      {error && !(error.status === 0 && copies.length > 0) && (
        <div className="notice notice-error" role="alert">
          {error.message}{" "}
          {error.status === 401 ? (
            <Link href="/api/auth/signin" prefetch={false}>Accedi di nuovo</Link>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => void load()}>
              Riprova
            </button>
          )}
        </div>
      )}

      {!data && !error && <p className="muted">Carico i progetti da GitHub…</p>}

      {!data && copies.length > 0 && (
        <section aria-labelledby="scaricati-titolo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="scaricati-titolo" className="serif" style={{ margin: 0 }}>
            Scaricati su questo dispositivo
          </h2>
          <div className="grid-cards">
            {copies.map((c) => (
              <Link key={`${c.project.owner}/${c.project.repo}`} href={`/progetto/${c.project.owner}/${c.project.repo}`} className="card project-card">
                <h2>{c.project.manifest.titolo}</h2>
                <span className="small muted">
                  {c.project.owner}/{c.project.repo}
                </span>
                <span className="small muted">Scaricato il {new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short" }).format(c.scaricatoIl)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data && data.progetti.length === 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }} className="serif">
            Nessun progetto, per ora
          </h2>
          <p className="muted">
            Crea un nuovo progetto (Writly crea per te un repository GitHub privato) oppure collega un repository che
            hai già.
          </p>
        </div>
      )}

      {data && data.progetti.length > 0 && (
        <div className="grid-cards">
          {data.progetti.map((p) => (
            <Link key={`${p.owner}/${p.repo}`} href={`/progetto/${p.owner}/${p.repo}`} className="card project-card">
              <span className="badge">{p.private ? "Privato" : "Pubblico"}</span>
              <h2>{p.description?.replace(/ — progetto Writly.*$/, "") || p.repo}</h2>
              <span className="small muted">
                {p.owner}/{p.repo}
              </span>
              {p.updatedAt && <span className="small muted">Ultima modifica: {formatDate(p.updatedAt)}</span>}
            </Link>
          ))}
        </div>
      )}

      <CreateDialog open={dialog === "crea"} onClose={() => setDialog(null)} onDone={open} />
      <ConnectDialog
        open={dialog === "collega"}
        candidates={data?.candidati ?? []}
        onClose={() => setDialog(null)}
        onDone={open}
      />
    </main>
  );
}

function TypeSelect({ value, onChange, id }: { value: ProjectType; onChange: (t: ProjectType) => void; id: string }) {
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as ProjectType)}>
      {PROJECT_TYPES.map((t) => (
        <option key={t} value={t}>
          {TYPE_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

function CreateDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (owner: string, repo: string) => void;
}) {
  const [titolo, setTitolo] = useState("");
  const [tipo, setTipo] = useState<ProjectType>("romanzo");
  const [nomeRepo, setNomeRepo] = useState("");
  const [repoEdited, setRepoEdited] = useState(false);
  const [titoloOpera, setTitoloOpera] = useState("");
  const [privato, setPrivato] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const repoName = repoEdited ? nomeRepo : titolo ? slugify(titolo, 90) : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const ref = await api<{ owner: string; repo: string }>("/api/progetti", {
        method: "POST",
        json: { azione: "crea", titolo, tipo, nomeRepo: repoName, privato, titoloOpera: tipo === "saga" ? titoloOpera : undefined },
      });
      onDone(ref.owner, ref.repo);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuovo progetto">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label htmlFor="np-titolo">Titolo</label>
          <input id="np-titolo" className="input" required maxLength={200} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="np-tipo">Tipo</label>
          <TypeSelect id="np-tipo" value={tipo} onChange={setTipo} />
        </div>
        {tipo === "saga" && (
          <div className="field">
            <label htmlFor="np-opera">Titolo del primo libro</label>
            <input id="np-opera" className="input" maxLength={200} value={titoloOpera} onChange={(e) => setTitoloOpera(e.target.value)} placeholder="Puoi aggiungere altri libri in seguito" />
          </div>
        )}
        <div className="field">
          <label htmlFor="np-repo">Nome del repository GitHub</label>
          <input
            id="np-repo"
            className="input"
            required
            maxLength={90}
            pattern="[A-Za-z0-9._\-]+"
            value={repoName}
            onChange={(e) => {
              setRepoEdited(true);
              setNomeRepo(e.target.value);
            }}
          />
          <span className="hint">Solo lettere, numeri, trattini. Viene creato nel tuo account.</span>
        </div>
        <label className="row small">
          <input type="checkbox" checked={privato} onChange={(e) => setPrivato(e.target.checked)} /> Repository privato
        </label>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !titolo.trim()}>
            {busy ? "Creo il repository…" : "Crea progetto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConnectDialog({
  open,
  candidates,
  onClose,
  onDone,
}: {
  open: boolean;
  candidates: RepoSummary[];
  onClose: () => void;
  onDone: (owner: string, repo: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [titolo, setTitolo] = useState("");
  const [tipo, setTipo] = useState<ProjectType>("romanzo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const [owner, repo] = selected.split("/");
    setBusy(true);
    setError("");
    try {
      await api("/api/progetti", { method: "POST", json: { azione: "collega", owner, repo, titolo: titolo || repo, tipo } });
      onDone(owner, repo);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Collega un repository esistente">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {candidates.length === 0 ? (
          <p className="muted">Non ci sono altri repository su cui hai permesso di scrittura.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="cr-repo">Repository</label>
              <select id="cr-repo" className="select" required value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Scegli…</option>
                {candidates.map((c) => (
                  <option key={`${c.owner}/${c.repo}`} value={`${c.owner}/${c.repo}`}>
                    {c.owner}/{c.repo}
                  </option>
                ))}
              </select>
              <span className="hint">
                Se il repository non contiene già un progetto Writly, vengono aggiunti writly.yaml, un&apos;opera e un primo
                capitolo. Nessun file esistente viene modificato.
              </span>
            </div>
            <div className="field">
              <label htmlFor="cr-titolo">Titolo del progetto</label>
              <input id="cr-titolo" className="input" maxLength={200} value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Se vuoto, il nome del repository" />
            </div>
            <div className="field">
              <label htmlFor="cr-tipo">Tipo</label>
              <TypeSelect id="cr-tipo" value={tipo} onChange={setTipo} />
            </div>
          </>
        )}
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !selected}>
            {busy ? "Collego…" : "Collega"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
