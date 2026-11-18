"use client";

import { useState, type FormEvent } from "react";
import type { ChapterComment } from "@/lib/project/comments";

export interface CommentDraft {
  citazione: string;
  prima: string;
  dopo: string;
}

export interface CommentsState {
  status: "loading" | "ready" | "error";
  commenti: ChapterComment[];
  errori: string[];
  message?: string;
}

export interface CommentActions {
  add: (draft: CommentDraft | null, testo: string) => Promise<boolean>;
  reply: (id: string, testo: string) => Promise<boolean>;
  resolve: (id: string, risolto: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  /** Mostra nel testo il passaggio citato. */
  reveal: (id: string) => void;
}

function when(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** La citazione come si legge, senza eventuali segni Markdown copiati dal file. */
function short(s: string, n = 140) {
  const clean = s.replace(/[*_\\]/g, "").replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

function CommentItem({
  c,
  anchored,
  active,
  busy,
  readOnly,
  actions,
  onActivate,
}: {
  c: ChapterComment;
  anchored: boolean;
  active: boolean;
  busy: boolean;
  readOnly: boolean;
  actions: CommentActions;
  onActivate: (id: string | null) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const mentor = c.tipo === "mentore";

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (await actions.reply(c.id, reply)) {
      setReply("");
      setReplying(false);
    }
  }

  return (
    <li className={`comment${active ? " is-active" : ""}${c.risolto ? " is-resolved" : ""}${mentor ? " is-mentor" : ""}`} id={`commento-${c.id}`}>
      <div className="comment-head small">
        <span className={`comment-badge${mentor ? " mentor" : ""}`}>{mentor ? "Mentore AI" : "Tu"}</span>
        {c.categoria && <span className="muted">{c.categoria}</span>}
        <span className="muted" style={{ marginLeft: "auto" }}>
          {when(c.creato)}
        </span>
      </div>
      {c.citazione ? (
        <button
          type="button"
          className="comment-quote serif"
          onClick={() => {
            onActivate(c.id);
            if (anchored) actions.reveal(c.id);
          }}
          title={anchored ? "Mostra il passaggio nel testo" : undefined}
        >
          «{short(c.citazione)}»{!anchored && <span className="small warn-text"> — passaggio non più nel testo</span>}
        </button>
      ) : (
        <div className="small muted">Sul capitolo intero</div>
      )}
      <div className="comment-text">{c.testo}</div>
      {c.risposte.length > 0 && (
        <ul className="comment-replies">
          {c.risposte.map((r, i) => (
            <li key={i}>
              <span className={`comment-badge${r.tipo === "mentore" ? " mentor" : ""}`}>{r.tipo === "mentore" ? "Mentore AI" : "Tu"}</span> {r.testo}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : replying ? (
        <form className="stack" style={{ gap: 6 }} onSubmit={sendReply}>
          <label htmlFor={`risposta-${c.id}`} className="sr-only">
            Risposta
          </label>
          <textarea id={`risposta-${c.id}`} className="input" rows={2} maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus />
          <div className="row" style={{ gap: 6 }}>
            <button type="submit" className="btn btn-small btn-primary" disabled={busy || !reply.trim()}>
              Invia risposta
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setReplying(false)}>
              Annulla
            </button>
          </div>
        </form>
      ) : (
        <div className="row comment-actions">
          {!c.risolto && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setReplying(true)} disabled={busy}>
              Rispondi
            </button>
          )}
          <button type="button" className="btn btn-small btn-ghost" onClick={() => void actions.resolve(c.id, !c.risolto)} disabled={busy}>
            {c.risolto ? "Riapri" : "Risolto"}
          </button>
          {!mentor && (
            <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => window.confirm("Eliminare il commento?") && void actions.remove(c.id)} disabled={busy}>
              Elimina
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Commenti del capitolo: dell'autore (dall'app) e del mentore AI (scritti da Claude Code nel repository). */
export default function CommentsPanel({
  state,
  anchored,
  active,
  onActivate,
  draft,
  onDraftCancel,
  actions,
  busy,
  readOnly,
}: {
  state: CommentsState;
  anchored: Record<string, boolean>;
  active: string | null;
  onActivate: (id: string | null) => void;
  /** Passaggio scelto per un nuovo commento: null = sul capitolo intero, undefined = nessun nuovo commento in corso. */
  draft: CommentDraft | null | undefined;
  onDraftCancel: () => void;
  actions: CommentActions;
  busy: boolean;
  readOnly: boolean;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const [testo, setTesto] = useState("");
  const open = state.commenti.filter((c) => !c.risolto);
  const resolved = state.commenti.filter((c) => c.risolto);
  const mentorOpen = open.filter((c) => c.tipo === "mentore").length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await actions.add(draft ?? null, testo)) setTesto("");
  }

  const item = (c: ChapterComment) => (
    <CommentItem key={c.id} c={c} anchored={anchored[c.id] ?? false} active={active === c.id} busy={busy} readOnly={readOnly} actions={actions} onActivate={onActivate} />
  );

  return (
    <section aria-labelledby="commenti-title">
      <h2 id="commenti-title" className="panel-title">
        Commenti
        {open.length > 0 && (
          <span className="muted">
            {" "}
            · {open.length} {open.length === 1 ? "aperto" : "aperti"}
            {mentorOpen ? `, ${mentorOpen} del mentore` : ""}
          </span>
        )}
      </h2>
      {state.status === "loading" && <p className="small muted">Carico i commenti…</p>}
      {state.status === "error" && <p className="small warn-text">{state.message ?? "Commenti non disponibili."}</p>}
      {state.errori.length > 0 && <p className="small warn-text">Alcuni commenti non si leggono: {state.errori[0]}</p>}

      {draft !== undefined && !readOnly && (
        <form className="comment comment-new stack" style={{ gap: 6 }} onSubmit={submit}>
          {draft ? <div className="comment-quote serif">«{short(draft.citazione)}»</div> : <div className="small muted">Commento sul capitolo intero</div>}
          <label htmlFor="nuovo-commento" className="sr-only">
            Nuovo commento
          </label>
          <textarea id="nuovo-commento" className="input" rows={3} maxLength={5000} placeholder="Cosa vuoi annotare?" value={testo} onChange={(e) => setTesto(e.target.value)} autoFocus />
          <div className="row" style={{ gap: 6 }}>
            <button type="submit" className="btn btn-small btn-primary" disabled={busy || !testo.trim()}>
              Aggiungi commento
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={onDraftCancel}>
              Annulla
            </button>
          </div>
        </form>
      )}

      {state.status === "ready" && open.length === 0 && draft === undefined && (
        <p className="small muted">Nessun commento aperto. Seleziona un passaggio e premi «Commenta», oppure chiedi una revisione al mentore AI.</p>
      )}
      {open.length > 0 && <ul className="comment-list">{open.map(item)}</ul>}
      {resolved.length > 0 && (
        <>
          <button type="button" className="btn btn-small btn-ghost" aria-expanded={showResolved} onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? "Nascondi" : "Mostra"} i risolti ({resolved.length})
          </button>
          {showResolved && <ul className="comment-list">{resolved.map(item)}</ul>}
        </>
      )}
    </section>
  );
}
