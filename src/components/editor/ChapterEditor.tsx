"use client";

import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SaveDialog from "@/components/ui/SaveDialog";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import { clearDraft, loadDraft, saveDraft, saveDraftNow, type Draft } from "@/lib/client/drafts";
import {
  CHAPTER_STATUSES,
  parseChapter,
  serializeChapter,
  type ChapterMeta,
  type ChapterStatus,
} from "@/lib/project/format";
import { VARIANT_PREFIX, chapterPath, variantName } from "@/lib/project/paths";
import type { ProjectData } from "@/lib/server/projects";
import { loadItalianSpellChecker, type SpellChecker } from "@/lib/spell/checker";
import { formatCount, textStats, type TextStats } from "@/lib/text/stats";
import type { SheetsData } from "@/lib/server/sheets";
import type { Scene, WorkStructure } from "@/lib/project/structure";
import { countMentions, createMentionMatcher, nameWords } from "@/lib/text/mentions";
import { rulesFor } from "@/lib/project/world";
import { characterAttributesText } from "@/lib/project/entities";
import { recordWriting, usePref } from "@/lib/client/prefs";
import { continuityWarnings, sheetAttributes, type ContinuityCharacter, type ContinuityWarning } from "@/lib/text/continuity";
import type { MentionMatcher } from "@/lib/text/mentions";
import { analyzeStyle, overusedWords, type StyleIssue, type StyleKind, type StyleOptions, type WordFrequency } from "@/lib/text/style";
import ChapterSidePanel, { summarize, SummaryCard } from "./ChapterSidePanel";
import HistoryDialog from "./HistoryDialog";
import MergeDialog, { type MergeRequest } from "./MergeDialog";
import { Mentions, refreshMentions, type MentionsSource } from "./mentions";
import { misspellingAt, refreshSpellcheck, Spellcheck } from "./spellcheck";
import { checkText, posToTextOffset, refreshTextChecks, textOffsetToPos, TextChecks, type TextMark } from "./textchecks";
import CommentsPanel, { type CommentActions, type CommentDraft, type CommentsState } from "./CommentsPanel";
import { anchorComment, quoteContext, type ChapterComment } from "@/lib/project/comments";

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

type Notice = { kind: "info" | "ok" | "warn" | "error"; text: string; action?: { label: string; run: () => void } } | null;

const EMPTY_STATS: TextStats = { parole: 0, battute: 0, battuteSenzaSpazi: 0 };

function plainText(editor: Editor) {
  return editor.getText({ blockSeparator: "\n" });
}

export type StylePrefs = Pick<StyleOptions, "ripetizioni" | "frasiLunghe" | "avverbi">;
export const STYLE_OFF: StylePrefs = { ripetizioni: false, frasiLunghe: false, avverbi: false };

/** Stato non reattivo dei controlli di stile e continuità, letto dalle decorazioni dell'editor. */
interface ChecksState {
  style: StylePrefs;
  continuity: { characters: ContinuityCharacter[]; matcher: MentionMatcher } | null;
  /** Parole dei nomi e termini del glossario: non contano come ripetizioni o parole abusate. */
  ignore: string[];
  comments: ChapterComment[];
  activeComment: string | null;
  cache: { text: string; style: StyleIssue[]; continuity: ContinuityWarning[]; anchors: Record<string, { start: number; end: number } | null> } | null;
}

function runChecks(checks: ChecksState, text: string) {
  if (checks.cache?.text === text) return checks.cache;
  const style = checks.style.ripetizioni || checks.style.frasiLunghe || checks.style.avverbi ? analyzeStyle(text, { ...checks.style, ignora: checks.ignore }) : [];
  const continuity = checks.continuity ? continuityWarnings(text, checks.continuity.characters, checks.continuity.matcher) : [];
  const anchors = Object.fromEntries(checks.comments.map((c) => [c.id, anchorComment(text, c)]));
  checks.cache = { text, style, continuity, anchors };
  return checks.cache;
}

function marksFor(checks: ChecksState, text: string): TextMark[] {
  const r = runChecks(checks, text);
  return [
    ...r.style.map((i) => ({ start: i.start, end: i.end, className: `style-mark style-${i.kind}`, note: i.note })),
    ...r.continuity.map((w) => ({ start: w.start, end: w.end, className: "continuity-mark", note: `Nella scheda di ${w.nome}: ${w.parte} ${w.atteso.join(", ")}` })),
    ...checks.comments.flatMap((c) => {
      const a = r.anchors[c.id];
      if (!a || c.risolto) return [];
      return [{ ...a, className: `comment-mark comment-${c.tipo}${checks.activeComment === c.id ? " is-active" : ""}`, attrs: { "data-comment": c.id } }];
    }),
  ];
}

export interface ChecksReport {
  counts: Record<StyleKind, number>;
  /** Commento → il passaggio citato c'è ancora nel testo. */
  anchored: Record<string, boolean>;
  continuity: ContinuityWarning[];
  overused: WordFrequency[];
}

function formatTime(ms: number) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export default function ChapterEditor({
  owner,
  repo,
  work,
  file,
  variant = null,
}: {
  owner: string;
  repo: string;
  work: string;
  file: string;
  /** Ramo della variante su cui si scrive (es. «variante/finale-alternativo»); null = versione principale. */
  variant?: string | null;
}) {
  const path = chapterPath(work, file);
  // Ogni variante ha la sua bozza locale.
  const draftKey = variant ? `${path}@${variant}` : path;
  const ramoQuery = variant ? `&ramo=${encodeURIComponent(variant)}` : "";
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
  const [sheets, setSheets] = useState<SheetsData | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [structure, setStructure] = useState<{ state: "loading" | "none" | "ready" | "error"; scenes: Scene[] }>({ state: "loading", scenes: [] });
  const [mentionCounts, setMentionCounts] = useState<Map<string, number>>(new Map());
  const [mentionFocus, setMentionFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; top: number; left: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [merge, setMerge] = useState<{ request: MergeRequest; onApply: (merged: string) => void } | null>(null);
  const [report, setReport] = useState<ChecksReport>({ counts: { ripetizione: 0, "frase-lunga": 0, avverbio: 0 }, anchored: {}, continuity: [], overused: [] });
  const [comments, setComments] = useState<CommentsState>({ status: "loading", commenti: [], errori: [] });
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null | undefined>(undefined);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [stylePrefs, setStylePrefs] = usePref<StylePrefs>("writly:stile", STYLE_OFF);
  const [focusMode, setFocusMode] = usePref<boolean>("writly:concentrazione", false);
  const [sessionGoal, setSessionGoal] = usePref<number>("writly:obiettivo-sessione", 0);
  const [sessionStart, setSessionStart] = useState<number | null>(null);

  // Stato non reattivo usato dalle callback dell'editor.
  const shaRef = useRef("");
  const metaRef = useRef<ChapterMeta>({ id: "", stato: "bozza" });
  const committedRef = useRef<{ body: string; stato: ChapterStatus }>({ body: "", stato: "bozza" });
  // Contenitore stabile: ProseMirror legge il checker solo quando ricalcola le decorazioni.
  const [spell] = useState<{ checker: SpellChecker | null }>(() => ({ checker: null }));
  const [ents] = useState<{ source: (MentionsSource & { ambiguous: string[] }) | null }>(() => ({ source: null }));
  const [checks] = useState<ChecksState>(() => ({ style: STYLE_OFF, continuity: null, ignore: [], comments: [], activeComment: null, cache: null }));
  const readyRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<(() => Promise<void>) | null>(null);

  const recompute = useCallback((editor: Editor) => {
    const plain = plainText(editor);
    const s = textStats(plain);
    setStats(s);
    if (ents.source) setMentionCounts(countMentions(ents.source.matcher, plain));
    const r = runChecks(checks, checkText(editor.state.doc));
    const counts = { ripetizione: 0, "frase-lunga": 0, avverbio: 0 };
    for (const i of r.style) counts[i.kind]++;
    const anchored = Object.fromEntries(Object.entries(r.anchors).map(([id, a]) => [id, !!a]));
    setReport({ counts, anchored, continuity: r.continuity, overused: overusedWords(plain, { ignora: checks.ignore }) });
    if (readyRef.current) recordWriting(owner, repo, draftKey, s.parole);
    const body = editor.getMarkdown();
    const isDirty = body !== committedRef.current.body || metaRef.current.stato !== committedRef.current.stato;
    setDirty(isDirty);
    return { body, isDirty };
  }, [ents, checks, owner, repo, draftKey]);

  const scheduleDraft = useCallback(
    (editor: Editor) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingDraft.current = async () => {
        pendingDraft.current = null;
        const { body, isDirty } = recompute(editor);
        if (!isDirty) {
          await clearDraft(owner, repo, draftKey);
          setLocalSaved(null);
          return;
        }
        const now = Date.now();
        const ok = await saveDraft(owner, repo, draftKey, { body, stato: metaRef.current.stato, baseSha: shaRef.current, updatedAt: now });
        setLocalSaved(ok ? now : null);
      };
      saveTimer.current = setTimeout(() => void pendingDraft.current?.(), 400);
    },
    [owner, repo, draftKey, recompute],
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
        saveDraftNow(owner, repo, draftKey, { body, stato: metaRef.current.stato, baseSha: shaRef.current, updatedAt: Date.now() });
      }
    }
    flushDraft();
  }, [owner, repo, draftKey, flushDraft]);

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
      Mentions.configure({ getSource: () => ents.source }),
      TextChecks.configure({ getCheck: () => (text) => marksFor(checks, text) }),
    ],
    editorProps: {
      attributes: { class: "prose-editor", spellcheck: "false", "aria-label": "Testo del capitolo", lang: "it" },
      handleClick: (_view, pos, event) => {
        const target = event.target as HTMLElement | null;
        const el = target?.closest?.(".spell-error");
        if (!el || !spell.checker) {
          setSpellMenu(null);
          const commentId = target?.closest?.("[data-comment]")?.getAttribute("data-comment");
          if (commentId) {
            setActiveComment(commentId);
            setPanelOpen(true);
            requestAnimationFrame(() => document.getElementById(`commento-${commentId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
          }
          const mention = commentId ? null : target?.closest?.("[data-mention]")?.getAttribute("data-mention");
          if (mention) {
            setMentionFocus(mention);
            setPanelOpen(true);
            setHover(null);
          }
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
          api<{ text: string; sha: string }>(`${base}/file?path=${encodeURIComponent(path)}${ramoQuery}`),
          loadDraft(owner, repo, draftKey),
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
          await clearDraft(owner, repo, draftKey);
        }

        readyRef.current = true;
        setSessionStart(textStats(plainText(editor)).parole);
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
  }, [editor, base, path, draftKey, ramoQuery, owner, repo, recompute]);

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

  // Schede (personaggi, mondo) e scene dell'opera: servono al pannello laterale
  // e al riconoscimento dei nomi. Se non arrivano, l'editor funziona lo stesso.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    api<SheetsData>(`${base}/schede`)
      .then((d) => {
        if (cancelled) return;
        // Riconoscimento dei nomi: evidenziati nel testo, contati nel pannello.
        const characterIds = new Set(d.personaggi.map((c) => c.data.id));
        const matcher = createMentionMatcher([
          ...d.personaggi.map((c) => ({ id: c.data.id, names: [c.data.nome, ...c.data.alias] })),
          ...d.voci.map((v) => ({ id: v.data.id, names: [v.data.nome, ...v.data.alias] })),
        ]);
        ents.source = { matcher, kindOf: (id) => (characterIds.has(id) ? "personaggio" : "voce"), ambiguous: matcher.ambiguous };
        checks.continuity = {
          matcher,
          characters: d.personaggi.map((c) => ({ id: c.data.id, nome: c.data.nome, attributi: sheetAttributes(characterAttributesText(c.data)) })),
        };
        checks.ignore = nameWords([
          ...d.personaggi.flatMap((c) => [c.data.nome, ...c.data.alias]),
          ...d.voci.flatMap((v) => [v.data.nome, ...v.data.alias]),
          ...d.glossario.items.map((t) => t.termine),
        ]);
        checks.cache = null;
        const ed = editorRef.current;
        if (ed) {
          refreshMentions(ed);
          refreshTextChecks(ed);
          if (readyRef.current) recompute(ed);
        }
        setSheets(d);
      })
      .catch((err: Error) => !cancelled && setSheetsError(err.message));
    api<{ struttura: WorkStructure | null }>(`${base}/opere/${work}/struttura`)
      .then((d) => {
        if (cancelled) return;
        setStructure(d.struttura ? { state: "ready", scenes: d.struttura.scene.filter((s) => s.capitolo === file) } : { state: "none", scenes: [] });
      })
      .catch(() => !cancelled && setStructure({ state: "error", scenes: [] }));
    return () => {
      cancelled = true;
    };
  }, [project, base, work, file, ents, checks, recompute]);

  // Controlli di stile scelti dall'autore (preferenza di questo browser).
  useEffect(() => {
    const { ripetizioni, frasiLunghe, avverbi } = stylePrefs;
    if (checks.style.ripetizioni === ripetizioni && checks.style.frasiLunghe === frasiLunghe && checks.style.avverbi === avverbi) return;
    checks.style = { ripetizioni, frasiLunghe, avverbi };
    checks.cache = null;
    if (editor) {
      refreshTextChecks(editor);
      if (readyRef.current) recompute(editor);
    }
  }, [stylePrefs, checks, editor, recompute]);

  // Commenti del capitolo (dell'autore e del mentore AI), sullo stesso ramo del capitolo.
  const commentsUrl = `${base}/commenti?opera=${encodeURIComponent(work)}&file=${encodeURIComponent(file)}${ramoQuery}`;
  const applyComments = useCallback(
    (list: ChapterComment[], errori: string[] = []) => {
      checks.comments = list;
      checks.cache = null;
      setComments({ status: "ready", commenti: list, errori });
      const ed = editorRef.current;
      if (ed) {
        refreshTextChecks(ed);
        if (readyRef.current) recompute(ed);
      }
    },
    [checks, recompute],
  );
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    api<{ commenti: ChapterComment[]; errori: string[] }>(commentsUrl)
      .then((d) => !cancelled && applyComments(d.commenti, d.errori))
      .catch((err: Error) => !cancelled && setComments({ status: "error", commenti: [], errori: [], message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [ready, commentsUrl, applyComments]);
  useEffect(() => {
    if (checks.activeComment === activeComment) return;
    checks.activeComment = activeComment;
    if (editor) refreshTextChecks(editor);
  }, [activeComment, checks, editor]);

  // Modalità concentrazione: nasconde barra in alto, pannello e strumenti.
  useEffect(() => {
    document.body.classList.toggle("focus-mode", focusMode);
    return () => document.body.classList.remove("focus-mode");
  }, [focusMode]);

  // Pagina dell'editor: su schermi larghi barra, intestazione e pannello restano fermi e scorre solo il testo.
  useEffect(() => {
    document.body.classList.add("editor-page");
    return () => document.body.classList.remove("editor-page");
  }, []);

  // Nomi delle schede e termini del glossario sono accettati dal controllo ortografico.
  useEffect(() => {
    if (!editor || !sheets || spellStatus !== "ready" || !spell.checker) return;
    spell.checker.accept(
      nameWords([
        ...sheets.personaggi.flatMap((c) => [c.data.nome, ...c.data.alias]),
        ...sheets.voci.flatMap((v) => [v.data.nome, ...v.data.alias]),
        ...sheets.glossario.items.map((t) => t.termine),
      ]),
    );
    refreshSpellcheck(editor);
  }, [editor, sheets, spellStatus, spell]);

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
        json: { path, text, sha: shaRef.current, message, ...(variant ? { ramo: variant } : {}) },
      });
      shaRef.current = res.sha;
      committedRef.current = { body, stato: metaRef.current.stato };
      await clearDraft(owner, repo, draftKey);
      setLocalSaved(null);
      recompute(editor);
      setConflict(null);
      setNotice({ kind: "ok", text: "Versione salvata su GitHub." });
      return null;
    } catch (err) {
      const e = err as ClientApiError;
      const text =
        e.status === 409
          ? "Il capitolo è stato modificato su GitHub dopo che l'hai aperto (da un altro dispositivo o da un altro strumento). Le tue modifiche sono al sicuro in questo browser: confrontale con la versione su GitHub e scegli cosa tenere."
          : e.message;
      setNotice({ kind: "error", text, ...(e.status === 409 ? { action: { label: "Confronta con GitHub e unisci", run: () => void mergeWithRemote() } } : {}) });
      if (e.status === 409) setDialog(null);
      return e.status === 409 ? null : text;
    }
  }

  /** Versione su GitHub (della stessa variante) diversa dalla nostra: unione guidata. */
  async function mergeWithRemote() {
    if (!editor) return;
    try {
      const remote = await api<{ text: string; sha: string }>(`${base}/file?path=${encodeURIComponent(path)}${ramoQuery}`);
      const theirs = parseChapter(remote.text).body;
      setMerge({
        request: {
          title: "Unisci con la versione su GitHub",
          intro: "Su GitHub c'è una versione più recente di quella da cui sei partito. Scegli, passaggio per passaggio, cosa tenere: il risultato va nell'editor e poi lo salvi come nuova versione.",
          mineLabel: "La mia versione",
          theirsLabel: "Su GitHub",
          mine: editor.getMarkdown(),
          theirs,
        },
        onApply: (merged) => {
          shaRef.current = remote.sha;
          committedRef.current = { body: theirs, stato: parseChapter(remote.text).meta.stato };
          restoreBody(merged, "L'unione");
          setConflict(null);
        },
      });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  /** Variante: confronto con la versione principale dello stesso capitolo. */
  async function mainVersion(): Promise<{ text: string; sha: string } | null> {
    try {
      return await api<{ text: string; sha: string }>(`${base}/file?path=${encodeURIComponent(path)}`);
    } catch (err) {
      const e = err as ClientApiError;
      setNotice({ kind: "error", text: e.status === 404 ? "Questo capitolo non esiste nella versione principale." : e.message });
      return null;
    }
  }

  async function compareWithMain() {
    if (!editor) return;
    const main = await mainVersion();
    if (!main) return;
    setMerge({
      request: {
        title: "Confronta con la versione principale",
        intro: "A sinistra il capitolo in questa variante, a destra nella versione principale. Puoi riprendere nella variante i passaggi della principale che ti servono.",
        mineLabel: "Questa variante",
        theirsLabel: "Versione principale",
        mine: editor.getMarkdown(),
        theirs: parseChapter(main.text).body,
      },
      onApply: (merged) => restoreBody(merged, "Il testo unito"),
    });
  }

  async function bringToMain() {
    if (!editor || !variant) return;
    if (!window.confirm(`Sostituire il capitolo nella versione principale con il testo di questa variante (come lo vedi ora nell'editor)? La versione precedente resta nello storico.`)) return;
    const main = await mainVersion();
    if (!main) return;
    try {
      const text = serializeChapter({ meta: { ...parseChapter(main.text).meta, stato: metaRef.current.stato }, body: editor.getMarkdown() });
      await api(`${base}/file`, {
        method: "PUT",
        json: { path, text, sha: main.sha, message: `${chapter?.titolo ?? file}: portato dalla variante «${variantName(variant)}»` },
      });
      setNotice({ kind: "ok", text: "Capitolo portato nella versione principale." });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
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
  async function commentAction(json: Record<string, unknown>): Promise<boolean> {
    setCommentBusy(true);
    try {
      const d = await api<{ commenti: ChapterComment[] }>(`${base}/commenti`, { method: "POST", json: { opera: work, file, ...(variant ? { ramo: variant } : {}), ...json } });
      applyComments(d.commenti);
      return true;
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
      return false;
    } finally {
      setCommentBusy(false);
    }
  }

  const commentActions: CommentActions = {
    add: async (draft, testo) => {
      const ok = await commentAction({ azione: "aggiungi", testo, ...(draft ?? {}) });
      if (ok) setCommentDraft(undefined);
      return ok;
    },
    reply: (id, testo) => commentAction({ azione: "rispondi", id, testo }),
    resolve: (id, risolto) => commentAction({ azione: "risolvi", id, risolto }),
    remove: (id) => commentAction({ azione: "elimina", id }),
    reveal: (id) => {
      const a = checks.cache?.anchors[id];
      if (!editor || !a) return;
      const doc = editor.state.doc;
      editor.chain().focus().setTextSelection({ from: textOffsetToPos(doc, a.start), to: textOffsetToPos(doc, a.end) }).scrollIntoView().run();
    },
  };

  /** Nuovo commento sul passaggio selezionato (o sul capitolo intero, senza selezione). */
  function startComment() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setPanelOpen(true);
    if (focusMode) setFocusMode(false);
    if (from === to) {
      setCommentDraft(null);
      return;
    }
    const text = checkText(editor.state.doc);
    const start = posToTextOffset(editor.state.doc, from);
    const end = posToTextOffset(editor.state.doc, to);
    const citazione = text.slice(start, end).trim();
    if (citazione.length > 2000) {
      setNotice({ kind: "warn", text: "Il passaggio selezionato è troppo lungo per un commento: scegline uno più breve (al massimo un paio di paragrafi)." });
      return;
    }
    const lead = text.slice(start, end).length - text.slice(start, end).trimStart().length;
    setCommentDraft({ citazione, ...quoteContext(text, start + lead, start + lead + citazione.length) });
  }

  const sessionWords = stats.parole - (sessionStart ?? stats.parole);
  const index = work_?.capitoli.findIndex((c) => c.file === file) ?? -1;
  const chapter = index >= 0 ? work_!.capitoli[index] : null;
  const prev = index > 0 ? work_!.capitoli[index - 1] : null;
  const next = work_ && index >= 0 && index < work_.capitoli.length - 1 ? work_.capitoli[index + 1] : null;
  const chapterHref = (f: string, v: string | null = variant) =>
    `/progetto/${owner}/${repo}/${work}/${f.replace(/\.md$/, "")}${v ? `?variante=${encodeURIComponent(v.slice(VARIANT_PREFIX.length))}` : ""}`;

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
          {sessionStart !== null && (
            <div>
              <dt>Sessione</dt>
              <dd>
                {sessionWords >= 0 ? "+" : "−"}
                {formatCount(Math.abs(sessionWords))}
                {sessionGoal > 0 && <span className="muted"> / {formatCount(sessionGoal)}</span>}
              </dd>
            </div>
          )}
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
          <button type="button" className="btn" aria-pressed={focusMode} onClick={() => setFocusMode(!focusMode)} title="Solo il testo: nasconde barra, strumenti e pannello">
            {focusMode ? "Esci dalla concentrazione" : "Concentrazione"}
          </button>
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
        <button type="button" className="tool" aria-pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
          Pannello
        </button>
        <button type="button" className="tool" onClick={startComment} disabled={!ready} title="Commenta il passaggio selezionato (senza selezione: il capitolo intero)">
          Commenta
        </button>
        <span className="tool-sep" aria-hidden="true" />
        <span className="small muted">
          Ortografia (italiano):{" "}
          {spellStatus === "loading" ? "carico il dizionario…" : spellStatus === "ready" ? `attiva · ${project?.dizionario.length ?? 0} ${project?.dizionario.length === 1 ? "parola" : "parole"} di progetto` : "non disponibile"}
        </span>
      </div>

      {variant && (
        <div className="variant-bar" role="note">
          <span>
            Stai scrivendo nella variante <strong>«{variantName(variant)}»</strong>: le versioni salvate qui non toccano la versione principale.
          </span>
          <span className="row">
            <button type="button" className="btn btn-small" onClick={() => void compareWithMain()} disabled={!ready}>
              Confronta con la principale
            </button>
            <button type="button" className="btn btn-small" onClick={() => void bringToMain()} disabled={!ready}>
              Porta nella principale
            </button>
            <Link className="btn btn-small btn-ghost" href={chapterHref(file, null)}>
              Torna alla principale
            </Link>
          </span>
        </div>
      )}

      {(notice || conflict) && (
        <div className="editor-notices">
          {conflict && (
            <div className="notice notice-warn" role="alert">
              In questo browser ci sono modifiche del {formatTime(conflict.updatedAt)} partite da una versione precedente: nel frattempo il capitolo è cambiato su GitHub. Adesso vedi la versione di GitHub.
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() =>
                    editor &&
                    setMerge({
                      request: {
                        title: "Unisci la bozza locale con GitHub",
                        intro: "La bozza in questo browser e la versione su GitHub sono cambiate entrambe. Scegli, passaggio per passaggio, cosa tenere.",
                        mineLabel: "La mia bozza",
                        theirsLabel: "Su GitHub",
                        mine: conflict.body,
                        theirs: editor.getMarkdown(),
                      },
                      onApply: (merged) => {
                        restoreBody(merged, "L'unione");
                        setConflict(null);
                      },
                    })
                  }
                >
                  Confronta e unisci
                </button>
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
                    await clearDraft(owner, repo, draftKey);
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
              {notice.action && (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    notice.action!.run();
                    setNotice(null);
                  }}
                >
                  {notice.action.label}
                </button>
              )}{" "}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setNotice(null)}>
                Chiudi
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`editor-body${panelOpen ? " with-panel" : ""}`}>
        <main
          className="editor-paper"
          onMouseOver={(e) => {
            const el = (e.target as HTMLElement).closest?.("[data-mention]");
            const id = el?.getAttribute("data-mention");
            if (!el || !id) return;
            if (hover?.id === id) return;
            const rect = el.getBoundingClientRect();
            setHover({ id, top: rect.bottom + window.scrollY + 6, left: Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 320)) });
          }}
          onMouseOut={(e) => {
            const to = e.relatedTarget as HTMLElement | null;
            if (!to?.closest?.("[data-mention]")) setHover(null);
          }}
          // Su schermi larghi scorre solo il foglio: le finestrelle ancorate al testo si chiudono.
          onScroll={() => {
            setHover(null);
            setSpellMenu(null);
          }}
        >
          <EditorContent editor={editor} />
          <nav className="chapter-nav" aria-label="Capitoli vicini">
            {prev ? <Link href={chapterHref(prev.file)}>← {prev.titolo}</Link> : <span />}
            {next ? <Link href={chapterHref(next.file)}>{next.titolo} →</Link> : <span />}
          </nav>
        </main>
        {panelOpen && !focusMode && (
          <ChapterSidePanel
            projectHref={`/progetto/${owner}/${repo}`}
            structureHref={`/progetto/${owner}/${repo}/struttura/${work}`}
            sheets={sheets}
            sheetsError={sheetsError}
            scenes={structure.scenes}
            rules={
              sheets
                ? rulesFor(sheets.regole.items, [...mentionCounts.keys(), ...structure.scenes.map((s) => s.luogo).filter((x): x is string => !!x)])
                : []
            }
            structureState={structure.state}
            counts={mentionCounts}
            ambiguous={ents.source?.ambiguous ?? []}
            focus={mentionFocus}
            onFocus={setMentionFocus}
            report={report}
            stylePrefs={stylePrefs}
            onStylePrefs={setStylePrefs}
            sessionWords={sessionStart === null ? null : sessionWords}
            sessionGoal={sessionGoal}
            onSessionGoal={setSessionGoal}
            overviewHref={`/progetto/${owner}/${repo}/panoramica`}
            workInfo={work_ ? { tema: work_.tema, premessa: work_.premessa } : null}
            commentsSlot={
              <CommentsPanel
                state={comments}
                anchored={report.anchored}
                active={activeComment}
                onActivate={setActiveComment}
                draft={commentDraft}
                onDraftCancel={() => setCommentDraft(undefined)}
                actions={commentActions}
                busy={commentBusy}
                readOnly={!ready}
              />
            }
          />
        )}
      </div>

      {hover && sheets && !spellMenu && (() => {
        const s = summarize(sheets, hover.id, `/progetto/${owner}/${repo}`);
        return s ? (
          <div className="mention-card" role="tooltip" style={{ top: hover.top, left: hover.left }}>
            <SummaryCard s={s} compact />
            <div className="small muted">Clic sul nome per la scheda completa nel pannello.</div>
          </div>
        ) : null;
      })()}


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

      <SaveDialog
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
        ramo={variant}
        currentBody={dialog === "storico" && editor ? editor.getMarkdown() : ""}
        onRestore={(body, when) => {
          setDialog(null);
          restoreBody(body, `La versione del ${when}`);
        }}
        onReplaceBody={(body, label) => restoreBody(body, label)}
      />
      <MergeDialog
        request={merge?.request ?? null}
        onClose={() => setMerge(null)}
        onApply={(merged) => {
          merge?.onApply(merged);
          setMerge(null);
        }}
      />
    </div>
  );
}
