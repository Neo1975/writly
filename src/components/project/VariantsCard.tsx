"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { useApiData } from "@/lib/client/hooks";
import { VARIANT_PREFIX } from "@/lib/project/paths";
import type { WorkSummary } from "@/lib/server/projects";
import type { Variant } from "@/lib/server/variants";

/**
 * Varianti del progetto (rami Git): per provare un finale alternativo o una
 * riscrittura senza toccare la versione principale, e poi unirla o scartarla.
 */
export default function VariantsCard({ base, owner, repo, works }: { base: string; owner: string; repo: string; works: WorkSummary[] }) {
  const list = useApiData<{ principale: string; varianti: Variant[] }>(`${base}/varianti`);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [opening, setOpening] = useState<Record<string, string>>({});

  const chapters = works.flatMap((w) => w.capitoli.map((c) => ({ key: `${w.slug}/${c.file.replace(/\.md$/, "")}`, label: works.length > 1 ? `${w.titolo} · ${c.titolo}` : c.titolo })));

  async function run(json: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      await api(`${base}/varianti`, { method: "POST", json });
      list.set(await api(`${base}/varianti`));
      setNotice({ kind: "ok", text: ok });
      return true;
    } catch (err) {
      setNotice({ kind: "error", text: (err as ClientApiError).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (await run({ azione: "crea", nome }, `Variante «${nome.trim()}» creata dalla versione principale.`)) setNome("");
  }

  return (
    <section className="card stack" aria-labelledby="varianti-title">
      <div>
        <h2 id="varianti-title" className="serif" style={{ margin: 0, fontSize: 22 }}>
          Varianti
        </h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Una variante è una copia del progetto in cui scrivere un finale alternativo o una riscrittura senza toccare la versione principale (su GitHub è un ramo <code>{VARIANT_PREFIX}…</code>).
        </p>
      </div>
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}
      {list.error && <div className="notice notice-error">{list.error.message}</div>}
      {list.data && list.data.varianti.length === 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          Nessuna variante.
        </p>
      )}
      {list.data && list.data.varianti.length > 0 && (
        <ul className="list" style={{ paddingLeft: 0 }}>
          {list.data.varianti.map((v) => {
            const slug = v.ramo.slice(VARIANT_PREFIX.length);
            const target = opening[v.ramo] ?? chapters[0]?.key;
            return (
              <li key={v.ramo} className="variant-row">
                <strong style={{ flex: "1 1 160px" }}>{v.nome}</strong>
                <label htmlFor={`var-cap-${slug}`} className="sr-only">
                  Capitolo da aprire in {v.nome}
                </label>
                <select id={`var-cap-${slug}`} className="select" style={{ width: "auto", maxWidth: 240 }} value={target} onChange={(e) => setOpening({ ...opening, [v.ramo]: e.target.value })}>
                  {chapters.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {target && (
                  <Link className="btn btn-small" href={`/progetto/${owner}/${repo}/${target}?variante=${encodeURIComponent(slug)}`}>
                    Scrivi nella variante
                  </Link>
                )}
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy}
                  onClick={() =>
                    window.confirm(`Unire «${v.nome}» nella versione principale? Tutte le modifiche della variante entrano nella principale.`) &&
                    void run({ azione: "unisci", ramo: v.ramo }, `Variante «${v.nome}» unita nella versione principale.`)
                  }
                >
                  Unisci nella principale
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-ghost danger-text"
                  disabled={busy}
                  onClick={() =>
                    window.confirm(`Eliminare la variante «${v.nome}»? Le versioni salvate solo lì andranno perse.`) && void run({ azione: "elimina", ramo: v.ramo }, `Variante «${v.nome}» eliminata.`)
                  }
                >
                  Elimina
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="row" onSubmit={create}>
        <label htmlFor="new-variant" className="sr-only">
          Nome della nuova variante
        </label>
        <input id="new-variant" className="input" style={{ flex: "1 1 240px", width: "auto" }} maxLength={60} required placeholder="es. Finale alternativo" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button type="submit" className="btn" disabled={busy || !nome.trim()}>
          Nuova variante
        </button>
      </form>
    </section>
  );
}
