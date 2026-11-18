"use client";

import { useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import { api, ClientApiError } from "@/lib/client/api";
import { shortId } from "@/lib/project/slug";
import { formatWorldDate, sortEvents, type Calendar, type Chronology, type WorldEvent } from "@/lib/project/world";
import type { SheetsData } from "@/lib/server/sheets";

/** Storia del mondo: calendario inventato (ere, mesi) ed eventi datati. Ogni modifica è un commit. */
export default function TimelinePanel({
  base,
  data,
  onData,
  onOpenEntry,
}: {
  base: string;
  data: SheetsData;
  onData: (d: SheetsData) => void;
  onOpenEntry: (id: string) => void;
}) {
  const chrono = data.cronologia.data;
  const [editing, setEditing] = useState<WorldEvent | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(next: Chronology, okText: string): Promise<string | null> {
    try {
      const res = await api<{ sha: string; data: Chronology }>(`${base}/schede`, {
        method: "POST",
        json: { azione: "cronologia", sha: data.cronologia.sha, data: next },
      });
      onData({ ...data, cronologia: res });
      setNotice({ kind: "ok", text: okText });
      return null;
    } catch (err) {
      const e = err as ClientApiError;
      const text = e.status === 409 ? "La storia del mondo è cambiata su GitHub nel frattempo: ricarica la pagina." : e.message;
      setNotice({ kind: "error", text });
      return text;
    }
  }

  const name = (id: string) =>
    data.voci.find((v) => v.data.id === id)?.data.nome ?? data.personaggi.find((c) => c.data.id === id)?.data.nome ?? "(eliminato)";
  const cal = chrono.calendario;

  // Raggruppati per era, nell'ordine del calendario.
  const groups: { label: string; events: WorldEvent[] }[] = [];
  for (const e of chrono.eventi) {
    const label = e.era ? (cal.ere.find((x) => x.id === e.era)?.nome ?? "Senza era") : "Senza era";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.events.push(e);
    else groups.push({ label, events: [e] });
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="small muted" style={{ margin: 0 }}>
          La cronologia del mondo, distinta dall&apos;ordine del racconto. Calendario: {cal.ere.length ? cal.ere.map((e) => e.nome).join(" → ") : "nessuna era"}
          {cal.mesi.length ? ` · ${cal.mesi.length} mesi` : " · solo anni"}.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => setCalendarOpen(true)}>
            Calendario
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing({ id: shortId(), titolo: "", era: cal.ere[cal.ere.length - 1]?.id ?? null, anno: 1, mese: null, giorno: null, descrizione: "", voci: [], personaggi: [] })}
          >
            Nuovo evento
          </button>
        </div>
      </div>
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      {chrono.eventi.length === 0 ? (
        <section className="card muted">Nessun evento. Imposta il calendario del tuo mondo (ere e mesi), poi aggiungi gli eventi.</section>
      ) : (
        groups.map((g, gi) => (
          <section key={`${g.label}-${gi}`} className="card">
            <h2 className="h2">{g.label}</h2>
            <ol className="timeline">
              {g.events.map((e) => (
                <li key={e.id}>
                  <div className="timeline-date">{formatWorldDate(e, cal)}</div>
                  <div>
                    <button type="button" className="link-button timeline-title" onClick={() => setEditing(e)}>
                      {e.titolo}
                    </button>
                    {e.descrizione && <div className="small">{e.descrizione}</div>}
                    {(e.voci.length > 0 || e.personaggi.length > 0) && (
                      <div className="chips" style={{ marginTop: 4 }}>
                        {e.voci.map((id) => (
                          <button key={id} type="button" className="chip" onClick={() => onOpenEntry(id)}>
                            {name(id)}
                          </button>
                        ))}
                        {e.personaggi.map((id) => (
                          <span key={id} className="chip chip-static">
                            {name(id)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && chrono.eventi.some((e) => e.id === editing.id) ? "Evento" : "Nuovo evento"} wide>
        {editing && (
          <EventForm
            key={editing.id}
            event={editing}
            cal={cal}
            data={data}
            isNew={!chrono.eventi.some((e) => e.id === editing.id)}
            onSave={async (ev) => {
              const exists = chrono.eventi.some((e) => e.id === ev.id);
              const eventi = sortEvents(exists ? chrono.eventi.map((e) => (e.id === ev.id ? ev : e)) : [...chrono.eventi, ev], cal.ere);
              const failure = await save({ ...chrono, eventi }, `Evento «${ev.titolo}» salvato.`);
              if (!failure) setEditing(null);
              return failure;
            }}
            onDelete={async (id) => {
              const failure = await save({ ...chrono, eventi: chrono.eventi.filter((e) => e.id !== id) }, "Evento eliminato.");
              if (!failure) setEditing(null);
              return failure;
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal open={calendarOpen} onClose={() => setCalendarOpen(false)} title="Calendario del mondo" wide>
        {calendarOpen && (
          <CalendarForm
            cal={cal}
            onSave={async (next) => {
              const failure = await save({ calendario: next, eventi: chrono.eventi }, "Calendario salvato.");
              if (!failure) setCalendarOpen(false);
              return failure;
            }}
            onClose={() => setCalendarOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}

function EventForm({
  event,
  cal,
  data,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  event: WorldEvent;
  cal: Calendar;
  data: SheetsData;
  isNew: boolean;
  onSave: (e: WorldEvent) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [e, setE] = useState<WorldEvent>(event);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<WorldEvent>) => setE((cur) => ({ ...cur, ...patch }));
  const toggle = (key: "voci" | "personaggi", id: string, on: boolean) => set({ [key]: on ? [...e[key], id] : e[key].filter((x) => x !== id) });

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError((await onSave({ ...e, titolo: e.titolo.trim() })) ?? "");
    setBusy(false);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="ev-titolo">Titolo</label>
        <input id="ev-titolo" className="input" required maxLength={200} value={e.titolo} onChange={(x) => set({ titolo: x.target.value })} autoFocus />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ev-era">Era</label>
          <select id="ev-era" className="select" value={e.era ?? ""} onChange={(x) => set({ era: x.target.value || null })}>
            <option value="">—</option>
            {cal.ere.map((er) => (
              <option key={er.id} value={er.id}>
                {er.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ev-anno">Anno</label>
          <input id="ev-anno" className="input" type="number" required step={1} value={e.anno} onChange={(x) => set({ anno: Math.trunc(Number(x.target.value) || 0) })} />
        </div>
        {cal.mesi.length > 0 && (
          <div className="field">
            <label htmlFor="ev-mese">Mese</label>
            <select id="ev-mese" className="select" value={e.mese ?? ""} onChange={(x) => set({ mese: x.target.value ? Number(x.target.value) : null })}>
              <option value="">—</option>
              {cal.mesi.map((m, i) => (
                <option key={m + i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="ev-giorno">Giorno</label>
          <input id="ev-giorno" className="input" type="number" min={1} step={1} value={e.giorno ?? ""} onChange={(x) => set({ giorno: x.target.value ? Math.max(1, Math.trunc(Number(x.target.value))) : null })} />
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Data: {formatWorldDate(e, cal)}
      </p>
      <div className="field">
        <label htmlFor="ev-desc">Descrizione</label>
        <textarea id="ev-desc" className="textarea" rows={3} maxLength={4000} value={e.descrizione} onChange={(x) => set({ descrizione: x.target.value })} />
      </div>
      {data.voci.length > 0 && (
        <fieldset className="fieldset">
          <legend>Voci del mondo coinvolte</legend>
          <div className="chips">
            {data.voci.map((v) => (
              <label key={v.data.id} className="chip-check">
                <input type="checkbox" checked={e.voci.includes(v.data.id)} onChange={(x) => toggle("voci", v.data.id, x.target.checked)} />
                {v.data.nome}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {data.personaggi.length > 0 && (
        <fieldset className="fieldset">
          <legend>Personaggi coinvolti</legend>
          <div className="chips">
            {data.personaggi.map((c) => (
              <label key={c.data.id} className="chip-check">
                <input type="checkbox" checked={e.personaggi.includes(c.data.id)} onChange={(x) => toggle("personaggi", c.data.id, x.target.checked)} />
                {c.data.nome}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        {!isNew && (
          <button
            type="button"
            className="btn btn-ghost danger-text"
            style={{ marginRight: "auto" }}
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Eliminare l'evento «${event.titolo}»?`)) return;
              setBusy(true);
              setError((await onDelete(event.id)) ?? "");
              setBusy(false);
            }}
          >
            Elimina evento
          </button>
        )}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Annulla
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !e.titolo.trim()}>
          {busy ? "Salvo…" : "Salva evento"}
        </button>
      </div>
    </form>
  );
}

function CalendarForm({ cal, onSave, onClose }: { cal: Calendar; onSave: (c: Calendar) => Promise<string | null>; onClose: () => void }) {
  const [ere, setEre] = useState(cal.ere);
  const [mesi, setMesi] = useState(cal.mesi.join(", "));
  const [newEra, setNewEra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= ere.length) return;
    const next = [...ere];
    [next[i], next[j]] = [next[j], next[i]];
    setEre(next);
  };

  async function save() {
    setBusy(true);
    const months = mesi.split(",").map((m) => m.trim()).filter(Boolean);
    setError((await onSave({ ere: ere.filter((e) => e.nome.trim()), mesi: months })) ?? "");
    setBusy(false);
  }

  return (
    <div className="stack">
      <fieldset className="fieldset">
        <legend>Ere, dalla più antica</legend>
        <ol className="plain-list">
          {ere.map((e, i) => (
            <li key={e.id} className="row">
              <label htmlFor={`era-${e.id}`} className="sr-only">
                Nome dell&apos;era
              </label>
              <input id={`era-${e.id}`} className="input" style={{ flex: "1 1 200px", width: "auto" }} maxLength={200} value={e.nome} onChange={(x) => setEre(ere.map((y, j) => (j === i ? { ...y, nome: x.target.value } : y)))} />
              <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta prima ${e.nome}`} onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta dopo ${e.nome}`} onClick={() => move(i, 1)} disabled={i === ere.length - 1}>
                ↓
              </button>
              <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => setEre(ere.filter((_, j) => j !== i))}>
                Togli
              </button>
            </li>
          ))}
        </ol>
        <div className="row" style={{ marginTop: 8 }}>
          <label htmlFor="new-era" className="sr-only">
            Nuova era
          </label>
          <input id="new-era" className="input" style={{ flex: "1 1 200px", width: "auto" }} maxLength={200} placeholder="es. Era del Sale" value={newEra} onChange={(x) => setNewEra(x.target.value)} />
          <button
            type="button"
            className="btn btn-small"
            disabled={!newEra.trim()}
            onClick={() => {
              setEre([...ere, { id: shortId(), nome: newEra.trim() }]);
              setNewEra("");
            }}
          >
            Aggiungi era
          </button>
        </div>
        <span className="hint">Gli eventi di un&apos;era tolta restano, senza era.</span>
      </fieldset>
      <div className="field">
        <label htmlFor="cal-mesi">Mesi, nell&apos;ordine</label>
        <textarea id="cal-mesi" className="textarea" rows={2} placeholder="separati da virgola, es. Brina, Disgelo, Semina…" value={mesi} onChange={(x) => setMesi(x.target.value)} />
        <span className="hint">Lascia vuoto per datare solo con gli anni.</span>
      </div>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Annulla
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Salvo…" : "Salva calendario"}
        </button>
      </div>
    </div>
  );
}
