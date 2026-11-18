"use client";

import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { shortId } from "@/lib/project/slug";
import { MAX_MAP_BYTES, type MapPin, type WorldMap } from "@/lib/project/world";
import type { Sheet, SheetsData } from "@/lib/server/sheets";

const ACCEPT = "image/png,image/jpeg,image/webp";

/** Legge un file scelto dall'autore come base64 (senza il prefisso data:). */
async function readImage(file: File): Promise<string> {
  if (file.size > MAX_MAP_BYTES) throw new Error("Immagine troppo grande: massimo 5 MB.");
  if (!ACCEPT.split(",").includes(file.type)) throw new Error("Formato non supportato: usa PNG, JPEG o WebP.");
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Non riesco a leggere il file."));
    r.readAsDataURL(file);
  });
  return url.slice(url.indexOf(",") + 1);
}

/** Mappe del mondo: un'immagine con segnaposti collegati alle voci. */
export default function MapsPanel({
  base,
  data,
  initialPath,
  highlight,
  onData,
  onOpenEntry,
  onDirty,
}: {
  base: string;
  data: SheetsData;
  initialPath: string | null;
  highlight: string | null;
  onData: (d: SheetsData) => void;
  onOpenEntry: (id: string) => void;
  onDirty: (d: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(initialPath ?? data.mappe[0]?.path ?? null);
  const [creating, setCreating] = useState(data.mappe.length === 0);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const current = data.mappe.find((m) => m.path === selected) ?? null;

  function replace(sheet: Sheet<WorldMap>) {
    const rest = data.mappe.filter((m) => m.path !== sheet.path);
    onData({ ...data, mappe: [...rest, sheet].sort((a, b) => a.data.nome.localeCompare(b.data.nome, "it")) });
  }

  return (
    <div className="split">
      <nav className="side-list" aria-label="Mappe">
        {data.mappe.map((m) => (
          <button
            key={m.path}
            type="button"
            className="side-item"
            aria-current={(!creating && m.path === current?.path) || undefined}
            onClick={() => {
              setSelected(m.path);
              setCreating(false);
              setNotice(null);
            }}
          >
            <span>{m.data.nome}</span>
            <span className="small muted">{m.data.segnaposti.length} segnaposti</span>
          </button>
        ))}
        <button type="button" className="side-item" aria-current={creating || undefined} onClick={() => setCreating(true)}>
          <span>+ Nuova mappa</span>
        </button>
      </nav>

      <div className="stack">
        {notice && (
          <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.text}
          </div>
        )}
        {creating ? (
          <NewMap
            base={base}
            onCreated={(sheet) => {
              replace(sheet);
              setSelected(sheet.path);
              setCreating(false);
              setNotice({ kind: "ok", text: `Mappa «${sheet.data.nome}» creata: scegli una voce e clicca sulla mappa per posizionarla.` });
            }}
          />
        ) : current ? (
          <MapEditor
            key={current.path + current.sha}
            base={base}
            sheet={current}
            data={data}
            highlight={highlight}
            onSaved={(sheet, msg) => {
              replace(sheet);
              setNotice({ kind: "ok", text: msg });
            }}
            onDeleted={() => {
              onData({ ...data, mappe: data.mappe.filter((m) => m.path !== current.path) });
              setSelected(null);
              setNotice({ kind: "ok", text: "Mappa eliminata." });
            }}
            onOpenEntry={onOpenEntry}
            onDirty={onDirty}
          />
        ) : (
          <section className="card muted">Nessuna mappa.</section>
        )}
      </div>
    </div>
  );
}

function NewMap({ base, onCreated }: { base: string; onCreated: (s: Sheet<WorldMap>) => void }) {
  const [nome, setNome] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const immagine = await readImage(file);
      const res = await api<Sheet<WorldMap>>(`${base}/schede`, {
        method: "POST",
        json: { azione: "mappa", data: { nome, immagine: "", segnaposti: [] }, immagine },
      });
      onCreated(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label="Nuova mappa">
      <p className="small muted" style={{ margin: 0 }}>
        Carica un&apos;immagine (disegnata a mano o con altri strumenti; PNG, JPEG o WebP fino a 5 MB): viene salvata nel repository, in <code>mondo/mappe/</code>.
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="map-nome">Nome della mappa</label>
          <input id="map-nome" className="input" required maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="map-file">Immagine</label>
          <input id="map-file" className="input" type="file" accept={ACCEPT} required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || !nome.trim() || !file}>
          {busy ? "Carico su GitHub…" : "Crea mappa"}
        </button>
      </div>
    </form>
  );
}

function MapEditor({
  base,
  sheet,
  data,
  highlight,
  onSaved,
  onDeleted,
  onOpenEntry,
  onDirty,
}: {
  base: string;
  sheet: Sheet<WorldMap>;
  data: SheetsData;
  highlight: string | null;
  onSaved: (s: Sheet<WorldMap>, msg: string) => void;
  onDeleted: () => void;
  onOpenEntry: (id: string) => void;
  onDirty: (d: boolean) => void;
}) {
  const [pins, setPins] = useState<MapPin[]>(sheet.data.segnaposti);
  const [nome, setNome] = useState(sheet.data.nome);
  const [active, setActive] = useState<string | null>(sheet.data.segnaposti.find((p) => p.voce === highlight)?.id ?? null);
  /** Voce da posizionare (nuovo segnaposto) o spostamento del segnaposto attivo. */
  const [placing, setPlacing] = useState<{ kind: "nuovo"; voce: string } | { kind: "sposta"; id: string } | null>(null);
  const [newVoce, setNewVoce] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const entryName = (id: string) => data.voci.find((v) => v.data.id === id)?.data.nome ?? "(voce eliminata)";
  const dirtyNow = (p: MapPin[], n: string) => JSON.stringify(p) !== JSON.stringify(sheet.data.segnaposti) || n !== sheet.data.nome;
  function changePins(next: MapPin[]) {
    setPins(next);
    onDirty(dirtyNow(next, nome));
  }

  function onMapClick(e: MouseEvent<HTMLDivElement>) {
    if (!placing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100);
    if (placing.kind === "nuovo") {
      const id = shortId();
      changePins([...pins, { id, voce: placing.voce, x, y }]);
      setActive(id);
      setNewVoce("");
    } else {
      changePins(pins.map((p) => (p.id === placing.id ? { ...p, x, y } : p)));
    }
    setPlacing(null);
  }

  async function save(immagine?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api<Sheet<WorldMap>>(`${base}/schede`, {
        method: "POST",
        json: { azione: "mappa", path: sheet.path, sha: sheet.sha, data: { ...sheet.data, nome, segnaposti: pins }, immagine },
      });
      onDirty(false);
      onSaved(res, immagine ? "Immagine della mappa sostituita." : "Mappa salvata su GitHub.");
    } catch (err) {
      const ex = err as ClientApiError;
      setError(ex.status === 409 ? "La mappa è cambiata su GitHub nel frattempo: ricarica la pagina." : ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function replaceImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await save(await readImage(file));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!window.confirm(`Eliminare la mappa «${sheet.data.nome}» e la sua immagine? Le voci restano.`)) return;
    setBusy(true);
    try {
      await api(`${base}/schede`, { method: "POST", json: { azione: "elimina", path: sheet.path, sha: sheet.sha } });
      onDirty(false);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const activePin = pins.find((p) => p.id === active);
  const placed = new Set(pins.map((p) => p.voce));

  return (
    <section className="card stack" aria-label={`Mappa ${sheet.data.nome}`}>
      <div className="row">
        <label htmlFor="map-name" className="sr-only">
          Nome della mappa
        </label>
        <input
          id="map-name"
          className="input"
          style={{ flex: "1 1 220px", width: "auto", fontWeight: 600 }}
          maxLength={200}
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            onDirty(dirtyNow(pins, e.target.value));
          }}
        />
        <label className="btn btn-small">
          Sostituisci immagine
          <input type="file" accept={ACCEPT} className="sr-only" onChange={replaceImage} disabled={busy} />
        </label>
      </div>

      <div className="row">
        <label htmlFor="pin-voce" className="small">
          Nuovo segnaposto per
        </label>
        <select id="pin-voce" className="select" style={{ flex: "1 1 200px", width: "auto" }} value={newVoce} onChange={(e) => setNewVoce(e.target.value)}>
          <option value="">Scegli una voce…</option>
          {data.categorie.items.map((c) => {
            const voci = data.voci.filter((v) => v.categoria === c.id);
            return voci.length ? (
              <optgroup key={c.id} label={c.nome}>
                {voci.map((v) => (
                  <option key={v.data.id} value={v.data.id}>
                    {v.data.nome}
                    {placed.has(v.data.id) ? " (già sulla mappa)" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
        <button type="button" className="btn btn-small" disabled={!newVoce} onClick={() => setPlacing({ kind: "nuovo", voce: newVoce })}>
          Posiziona sulla mappa
        </button>
      </div>
      {placing && (
        <div className="notice" role="status">
          Clicca sulla mappa nel punto di «{entryName(placing.kind === "nuovo" ? placing.voce : (activePin?.voce ?? ""))}».{" "}
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setPlacing(null)}>
            Annulla
          </button>
        </div>
      )}

      <div className={`map-canvas${placing ? " is-placing" : ""}`} onClick={onMapClick}>
        {/* eslint-disable-next-line @next/next/no-img-element -- immagine privata servita dalla nostra API, non ottimizzabile da next/image */}
        <img src={`${base}/immagine?path=${encodeURIComponent(sheet.data.immagine)}`} alt={`Mappa: ${nome}`} draggable={false} />
        {pins.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`map-pin${p.id === active ? " is-active" : ""}${p.voce === highlight ? " is-highlight" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            aria-label={`Segnaposto: ${entryName(p.voce)}`}
            aria-pressed={p.id === active}
            onClick={(e) => {
              e.stopPropagation();
              if (!placing) setActive(p.id === active ? null : p.id);
            }}
          >
            <span className="map-pin-label" aria-hidden="true">
              {entryName(p.voce)}
            </span>
          </button>
        ))}
      </div>

      {activePin && (
        <div className="row card-inset">
          <strong style={{ flex: 1 }}>{entryName(activePin.voce)}</strong>
          <button type="button" className="btn btn-small" onClick={() => onOpenEntry(activePin.voce)}>
            Apri la voce
          </button>
          <button type="button" className="btn btn-small" onClick={() => setPlacing({ kind: "sposta", id: activePin.id })}>
            Sposta
          </button>
          <button
            type="button"
            className="btn btn-small btn-ghost danger-text"
            onClick={() => {
              changePins(pins.filter((p) => p.id !== activePin.id));
              setActive(null);
            }}
          >
            Togli
          </button>
        </div>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="row sticky-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirtyNow(pins, nome) || !nome.trim()} onClick={() => save()}>
          {busy ? "Salvo su GitHub…" : "Salva mappa"}
        </button>
        <button type="button" className="btn btn-ghost danger-text" onClick={remove} disabled={busy}>
          Elimina mappa
        </button>
      </div>
    </section>
  );
}
