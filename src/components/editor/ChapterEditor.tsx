"use client";

import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import { clearDraft, loadDraft, saveDraft, saveDraftNow, type Draft } from "@/lib/client/drafts";
import {
  CHAPTER_STATUSES,
  parseChapter,
  serializeChapter,
  type ChapterMeta,
  type ChapterStatus,
} from "@/lib/project/format";
import { chapterPath } from "@/lib/project/paths";
import type { ProjectData } from "@/lib/server/projects";
import { loadItalianSpellChecker, type SpellChecker } from "@/lib/spell/checker";
import { formatCount, textStats, type TextStats } from "@/lib/text/stats";
import HistoryDialog from "./HistoryDialog";
import { misspellingAt, refreshSpellcheck, Spellcheck } from "./spellcheck";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  bozza: "Bozza",
  "in-stesura": "In stesura",
  scritto: "Scritto",
  revisionato: "Revisionato",
};

interface SpellMenuState {
  word: string;
  from: number;
  to: number;
  top: number;
  left: number;
  suggestions: string[];
}

type Notice = { kind: "info" | "ok" | "warn" | "error"; text: string } | null;

const EMPTY_STATS: TextStats = { parole: 0, battute: 0, battuteSenzaSpazi: 0 };

function plainText(editor: Editor) {
  return editor.getText({ blockSeparator: "\n" });
}

function formatTime(ms: number) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export default function ChapterEditor({ owner, repo, work, file }: { owner: string; repo: string; work: string; file: string }) {
  const path = chapterPath(work, file);
  const base = projectApi(owner, repo);

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loadError, setLoadError] = useState<ClientApiError | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [conflict, setConflict] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [localSaved, setLocalSaved] = useState<number | null>(null);
  const [stato, setStato] = useState<ChapterStatus>("bozza");
  const [stats, setStats] = useState<TextStats>(EMPTY_STATS);
  const [selection, setSelection] = useState<TextStats | null>(null);
  const [spellStatus, setSpellStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spellMenu, setSpellMenu] = useState<SpellMenuState | null>(null);
  const [dialog, setDialog] = useState<"salva" | "storico" | null>(null);

  // Stato non reattivo usato dalle callback dell'editor.
  const shaRef = useRef("");
  const metaRef = useRef<ChapterMeta>({ id: "", stato: "bozza" });
  const committedRef = useRef<{ body: string; stato: ChapterStatus }>({ body: "", stato: "bozza" });
  // Contenitore stabile: ProseMirror legge il checker solo quando ricalcola le decorazioni.
  const [spell] = useState<{ checker: SpellChecker | null }>(() => ({ checker: null }));
  const readyRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<(() => Promise<void>) | null>(null);

  const recompute = useCallback((editor: Editor) => {
    setStats(textStats(plainText(editor)));
    const body = editor.getMarkdown();
    const isDirty = body !== committedRef.current.body || metaRef.current.stato !== committedRef.current.stato;
    setDirty(isDirty);
    return { body, isDirty };
  }, []);

  const scheduleDraft = useCallback(
    (editor: Editor) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingDraft.current = async () => {
        pendingDraft.current = null;
        const { body, isDirty } = recompute(editor);
        if (!isDirty) {
          await clearDraft(owner, repo, path);
          setLocalSaved(null);
          return;
        }
        const now = Date.now();
        const ok = await saveDraft(owner, repo, path, { body, stato: metaRef.current.stato, baseSha: shaRef.current, updatedAt: now });
        setLocalSaved(ok ? now : null);
      };
      saveTimer.current = setTimeout(() => void pendingDraft.current?.(), 400);
    },
    [owner, repo, path, recompute],
  );

  /** Scrive subito la bozza in sospeso (cambio capitolo, scheda nascosta). */
  const flushDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    void pendingDraft.current?.();
  }, []);

  /** Pagina in chiusura: copia sincrona di emergenza, poi il normale salvataggio. */
  const flushDraftOnExit = useCallback(() => {
    const editor = editorRef.current;
    if (pendingDraft.current && editor && readyRef.current) {
      const body = editor.getMarkdown();
      if (body !== committedRef.current.body || metaRef.current.stato !== committedRef.current.stato) {
        saveDraftNow(owner, repo, path, { body, stato: metaRef.current.stato, baseSha: shaRef.current, updatedAt: Date.now() });
      }
    }
    flushDraft();
  }, [owner, repo, path, flushDraft]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        underline: false,
        link: { openOnClick: false },
      }),
      Markdown,
      Spellcheck.configure({ getChecker: () => spell.checker }),
    ],
    editorProps: {
      attributes: { class: "prose-editor", spellcheck: "false", "aria-label": "Testo del capitolo", lang: "it" },
      handleClick: (_view, pos, event) => {
        const target = event.target as HTMLElement | null;
        const el = target?.closest?.(".spell-error");
        if (!el || !spell.checker) {
          setSpellMenu(null);
          return false;
        }
        const ed = editorRef.current;
        const hit = ed ? misspellingAt(ed, pos) : null;
        if (!hit) return false;
        const rect = el.getBoundingClientRect();
        setSpellMenu({
          ...hit,
          top: rect.bottom + window.scrollY + 6,
          left: Math.min(rect.left + window.scrollX, window.innerWidth - 300),
          suggestions: spell.checker.suggest(hit.word),
        });
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!readyRef.current) return;
      setSpellMenu(null);
      recompute(editor);
      scheduleDraft(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      setSelection(from === to ? null : textStats(editor.state.doc.textBetween(from, to, "\n")));
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            h2: e.isActive("heading", { level: 2 }),
            quote: e.isActive("blockquote"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Caricamento: progetto (titolo, dizionario), capitolo da GitHub, eventuale bozza locale.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      try {
        const [proj, remote, draft] = await Promise.all([
          api<ProjectData>(base),
          api<{ text: string; sha: string }>(`${base}/file?path=${encodeURIComponent(path)}`),
          loadDraft(owner, repo, path),
        ]);
        if (cancelled) return;
        const doc = parseChapter(remote.text);
        shaRef.current = remote.sha;
        metaRef.current = doc.meta;
        editor.commands.setContent(doc.body, { contentType: "markdown", emitUpdate: false });
        committedRef.current = { body: editor.getMarkdown(), stato: doc.meta.stato };
        setProject(proj);
        setStato(doc.meta.stato);

        const differs = draft && (draft.body !== committedRef.current.body || draft.stato !== doc.meta.stato);
        if (draft && differs) {
          if (draft.baseSha === remote.sha) {
            editor.commands.setContent(draft.body, { contentType: "markdown", emitUpdate: false });
            metaRef.current = { ...metaRef.current, stato: draft.stato };
            setStato(draft.stato);
            setLocalSaved(draft.updatedAt);
            setNotice({ kind: "info", text: `Ho ripreso le modifiche salvate in questo browser il ${formatTime(draft.updatedAt)}, non ancora salvate in versione.` });
          } else {
            setConflict(draft);
          }
        } else if (draft) {
          await clearDraft(owner, repo, path);
        }

        readyRef.current = true;
        recompute(editor);
        editor.setEditable(true);
        setReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(err as ClientApiError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, base, path, owner, repo, recompute]);

  // Controllo ortografico: Hunspell italiano + dizionario del progetto.
  useEffect(() => {
    if (!editor || !project) return;
    let cancelled = false;
    loadItalianSpellChecker()
      .then((checker) => {
        if (cancelled) return;
        checker.accept(project.dizionario);
        spell.checker = checker;
        setSpellStatus("ready");
        refreshSpellcheck(editor);
      })
      .catch(() => !cancelled && setSpellStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [editor, project, spell]);

  // Ctrl/Cmd+S apre "Salva versione".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (readyRef.current) setDialog("salva");
      }
      if (e.key === "Escape") setSpellMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Nessuna battuta persa: la bozza in sospeso si scrive quando la pagina viene
  // nascosta o chiusa, e quando si lascia l'editor (es. passando a un altro capitolo).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushDraftOnExit();
    };
    window.addEventListener("pagehide", flushDraftOnExit);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushDraftOnExit);
      document.removeEventListener("visibilitychange", onHide);
      flushDraft();
    };
  }, [flushDraft, flushDraftOnExit]);

  function changeStatus(next: ChapterStatus) {
    metaRef.current = { ...metaRef.current, stato: next };
    setStato(next);
    if (editor) {
      recompute(editor);
      scheduleDraft(editor);
    }
  }

  /** Salva una versione (commit). Restituisce null se riuscito, altrimenti il messaggio d'errore. */
  async function saveVersion(message: string): Promise<string | null> {
    if (!editor) return "Editor non pronto.";
    const body = editor.getMarkdown();
    const text = serializeChapter({ meta: metaRef.current, body });
    try {
      const res = await api<{ sha: string }>(`${base}/file`, {
        method: "PUT",
        json: { path, text, sha: shaRef.current, message },
      });
      shaRef.current = res.sha;
      committedRef.current = { body, stato: metaRef.current.stato };
      await clearDraft(owner, repo, path);
      setLocalSaved(null);
      recompute(editor);
      setConflict(null);
      setNotice({ kind: "ok", text: "Versione salvata su GitHub." });
      return null;
    } catch (err) {
      const e = err as ClientApiError;
      const text =
        e.status === 409
          ? "Il capitolo è stato modificato su GitHub dopo che l'hai aperto. Le tue modifiche sono al sicuro in questo browser: apri lo storico per confrontare, oppure ricarica la pagina."
          : e.message;
      setNotice({ kind: "error", text });
      return text;
    }
  }

  function restoreBody(body: string, label: string) {
    if (!editor) return;
    editor.commands.setContent(body, { contentType: "markdown" });
    setNotice({ kind: "warn", text: `${label} caricata nell'editor. Salva una nuova versione per confermarla.` });
  }

  async function addToDictionary(word: string) {
    setSpellMenu(null);
    try {
      const res = await api<{ dizionario: string[] }>(base, { method: "POST", json: { azione: "aggiungi-parola", parola: word } });
      spell.checker?.accept([word]);
      setProject((p) => (p ? { ...p, dizionario: res.dizionario } : p));
      if (editor) refreshSpellcheck(editor);
      setNotice({ kind: "ok", text: `«${word}» aggiunta al dizionario del progetto.` });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  function ignoreWord(word: string) {
    setSpellMenu(null);
    spell.checker?.accept([word]);
    if (editor) refreshSpellcheck(editor);
  }

  function replaceWord(menu: SpellMenuState, replacement: string) {
    setSpellMenu(null);
    editor?.chain().focus().insertContentAt({ from: menu.from, to: menu.to }, replacement).run();
  }

  const work_ = project?.opere.find((o) => o.slug === work);
  const index = work_?.capitoli.findIndex((c) => c.file === file) ?? -1;
  const chapter = index >= 0 ? work_!.capitoli[index] : null;
  const prev = index > 0 ? work_!.capitoli[index - 1] : null;
  const next = work_ && index >= 0 && index < work_.capitoli.length - 1 ? work_.capitoli[index + 1] : null;
  const chapterHref = (f: string) => `/progetto/${owner}/${repo}/${work}/${f.replace(/\.md$/, "")}`;

  if (loadError) {
    return (
      <main className="page">
        <div className="notice notice-error" role="alert">
          {loadError.message} {loadError.status === 401 && <Link href="/api/auth/signin" prefetch={false}>Accedi di nuovo</Link>}
        </div>
        <Link href={`/progetto/${owner}/${repo}`}>← Torna al progetto</Link>
      </main>
    );
  }

  return (
    <div className="editor-shell">
      <header className="editor-head">
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <Link href={`/progetto/${owner}/${repo}`} className="small">
            ← {project?.manifest.titolo ?? "Progetto"}
            {work_ && project && project.opere.length > 1 ? ` · ${work_.titolo}` : ""}
          </Link>
          <h1 className="editor-title">{chapter?.titolo ?? (ready ? file : "Carico il capitolo…")}</h1>
        </div>
        <dl className="stats" aria-label="Statistiche del capitolo">
          <div>
            <dt>Parole</dt>
            <dd>{formatCount(stats.parole)}</dd>
          </div>
          <div>
            <dt>Battute con spazi</dt>
            <dd>{formatCount(stats.battute)}</dd>
          </div>
          <div>
            <dt>senza spazi</dt>
            <dd>{formatCount(stats.battuteSenzaSpazi)}</dd>
          </div>
          {selection && (
            <div className="stats-selection">
              <dt>Selezione</dt>
              <dd>
                {formatCount(selection.parole)} parole · {formatCount(selection.battute)} battute ·{" "}
                {formatCount(selection.battuteSenzaSpazi)} senza spazi
              </dd>
            </div>
          )}
        </dl>
        <div className="row">
          <span className="small muted row" style={{ gap: 6 }} aria-live="polite">
            <span className={`status-dot ${dirty ? "dirty" : "clean"}`} aria-hidden="true" />
            {!ready
              ? "Caricamento…"
              : dirty
                ? localSaved
                  ? "Salvato in questo browser · non ancora in versione"
                  : "Modifiche non ancora in versione"
                : "Tutto salvato in versione"}
          </span>
          <label htmlFor="stato" className="sr-only">
            Stato del capitolo
          </label>
          <select id="stato" className="select" style={{ width: "auto", minHeight: 36 }} value={stato} onChange={(e) => changeStatus(e.target.value as ChapterStatus)} disabled={!ready}>
            {CHAPTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => setDialog("storico")} disabled={!ready}>
            Storico
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog("salva")} disabled={!ready || !dirty}>
            Salva versione
          </button>
        </div>
      </header>

      <div role="toolbar" aria-label="Formattazione" className="editor-toolbar">
        <button type="button" className="tool" aria-label="Grassetto" aria-pressed={!!active?.bold} onClick={() => editor?.chain().focus().toggleBold().run()} disabled={!ready}>
          <b>G</b>
        </button>
        <button type="button" className="tool" aria-label="Corsivo" aria-pressed={!!active?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={!ready}>
          <i className="serif">C</i>
        </button>
        <button type="button" className="tool" aria-pressed={!!active?.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} disabled={!ready}>
          Titolo
        </button>
        <button type="button" className="tool" aria-pressed={!!active?.quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} disabled={!ready}>
          Citazione
        </button>
        <button type="button" className="tool" onClick={() => editor?.chain().focus().setHorizontalRule().run()} disabled={!ready}>
          Cambio scena
        </button>
        <span className="tool-sep" aria-hidden="true" />
        <button type="button" className="tool" aria-label="Annulla" onClick={() => editor?.chain().focus().undo().run()} disabled={!active?.canUndo}>
          ↶
        </button>
        <button type="button" className="tool" aria-label="Ripeti" onClick={() => editor?.chain().focus().redo().run()} disabled={!active?.canRedo}>
          ↷
        </button>
        <span className="tool-sep" aria-hidden="true" />
        <span className="small muted">
          Ortografia (italiano):{" "}
          {spellStatus === "loading" ? "carico il dizionario…" : spellStatus === "ready" ? `attiva · ${project?.dizionario.length ?? 0} ${project?.dizionario.length === 1 ? "parola" : "parole"} di progetto` : "non disponibile"}
        </span>
      </div>

      {(notice || conflict) && (
        <div className="editor-notices">
          {conflict && (
            <div className="notice notice-warn" role="alert">
              In questo browser ci sono modifiche del {formatTime(conflict.updatedAt)} partite da una versione precedente: nel frattempo il capitolo è cambiato su GitHub. Adesso vedi la versione di GitHub.
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    restoreBody(conflict.body, "La tua bozza locale");
                    changeStatus(conflict.stato);
                    setConflict(null);
                  }}
                >
                  Usa le mie modifiche locali
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={async () => {
                    await clearDraft(owner, repo, path);
                    setConflict(null);
                  }}
                >
                  Scarta le modifiche locali
                </button>
              </div>
            </div>
          )}
          {notice && (
            <div className={`notice ${notice.kind === "info" ? "" : `notice-${notice.kind}`}`} role="status">
              {notice.text}{" "}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setNotice(null)}>
                Chiudi
              </button>
            </div>
          )}
        </div>
      )}

      <main className="editor-paper">
        <EditorContent editor={editor} />
      </main>

      <nav className="chapter-nav" aria-label="Capitoli vicini">
        {prev ? <Link href={chapterHref(prev.file)}>← {prev.titolo}</Link> : <span />}
        {next ? <Link href={chapterHref(next.file)}>{next.titolo} →</Link> : <span />}
      </nav>

      {spellMenu && (
        <div className="spell-menu" role="dialog" aria-label={`Suggerimenti per ${spellMenu.word}`} style={{ top: spellMenu.top, left: spellMenu.left }}>
          <div className="small muted" style={{ padding: "6px 10px" }}>
            «{spellMenu.word}» non è nel dizionario
          </div>
          {spellMenu.suggestions.length === 0 && (
            <div className="small muted" style={{ padding: "4px 10px" }}>
              Nessun suggerimento
            </div>
          )}
          {spellMenu.suggestions.map((s) => (
            <button key={s} type="button" className="spell-option spell-suggestion" onClick={() => replaceWord(spellMenu, s)}>
              {s}
            </button>
          ))}
          <hr />
          <button type="button" className="spell-option" onClick={() => void addToDictionary(spellMenu.word)}>
            Aggiungi al dizionario del progetto
          </button>
          <button type="button" className="spell-option" onClick={() => ignoreWord(spellMenu.word)}>
            Ignora in questa sessione
          </button>
        </div>
      )}

      <SaveVersionDialog
        open={dialog === "salva"}
        onClose={() => setDialog(null)}
        defaultMessage={`${chapter?.titolo ?? file}: aggiornamento`}
        onSave={saveVersion}
      />
      <HistoryDialog
        open={dialog === "storico"}
        onClose={() => setDialog(null)}
        base={base}
        path={path}
        onRestore={(body, when) => {
          setDialog(null);
          restoreBody(body, `La versione del ${when}`);
        }}
      />
    </div>
  );
}

function SaveVersionDialog({
  open,
  onClose,
  defaultMessage,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  defaultMessage: string;
  onSave: (message: string) => Promise<string | null>;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Salva versione">
      <SaveVersionForm key={String(open)} defaultMessage={defaultMessage} onClose={onClose} onSave={onSave} />
    </Modal>
  );
}

function SaveVersionForm({
  defaultMessage,
  onClose,
  onSave,
}: {
  defaultMessage: string;
  onClose: () => void;
  onSave: (message: string) => Promise<string | null>;
}) {
  const [message, setMessage] = useState(defaultMessage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const failure = await onSave(message);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label htmlFor="msg">Cosa è cambiato?</label>
        <textarea id="msg" className="textarea" required maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
        <span className="hint">Diventa il messaggio del commit su GitHub: ti aiuta a ritrovare questa versione nello storico.</span>
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
        <button type="submit" className="btn btn-primary" disabled={busy || !message.trim()}>
          {busy ? "Salvo su GitHub…" : "Salva versione"}
        </button>
      </div>
    </form>
  );
}
