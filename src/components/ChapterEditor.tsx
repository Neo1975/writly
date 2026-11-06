"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { apiFetch, withBranch } from "@/lib/api-client";
import { useCurrentBranch } from "@/contexts/BranchContext";
import {
  findHighlightRange,
  getHighlightColor,
  stripHighlights,
  unwrapHighlight,
  wrapWithHighlight,
} from "@/lib/markdown";
import {
  DEFAULT_HIGHLIGHT_COLOR_ID,
  HIGHLIGHT_COLORS,
  getHighlightSwatch,
} from "@/lib/highlight-colors";
import { italianSpellcheck } from "@/lib/codemirror-spellcheck";
import { livePreview } from "@/lib/codemirror-live-preview";
import { loadItalianSpellChecker, type SpellChecker } from "@/lib/spellcheck";
import { useCommitMessageDialog } from "@/hooks/useCommitMessageDialog";
import { ChapterCharacters } from "@/components/ChapterCharacters";
import { ChapterCommitLog } from "@/components/ChapterCommitLog";
import { ChapterVersionCompare } from "@/components/ChapterVersionCompare";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import type { ChapterComment } from "@/lib/types";

interface ChapterData {
  content: string;
  sha: string;
  comments: ChapterComment[];
}

export function ChapterEditor({
  owner,
  repo,
  romanzoSlug,
  file,
  title,
}: {
  owner: string;
  repo: string;
  romanzoSlug: string;
  file: string;
  title: string;
}) {
  const branch = useCurrentBranch(owner, repo);
  const base = withBranch(
    `/api/sagas/${owner}/${repo}/romanzi/${romanzoSlug}/capitoli/${encodeURIComponent(
      file
    )}`,
    branch
  );

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [sha, setSha] = useState<string | undefined>(undefined);
  const [comments, setComments] = useState<ChapterComment[]>([]);
  const [commitLogVersion, setCommitLogVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<{
    id: string;
    text: string;
    color: string;
  } | null>(null);
  const [selectedColor, setSelectedColor] = useState(DEFAULT_HIGHLIGHT_COLOR_ID);
  const [commentDraft, setCommentDraft] = useState("");
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(
    null
  );
  const [spellChecker, setSpellChecker] = useState<SpellChecker | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const { promptMessage, dialog: commitDialog } = useCommitMessageDialog();

  const plainText = useMemo(() => stripHighlights(content), [content]);
  const wordCount = plainText.trim() === "" ? 0 : plainText.trim().split(/\s+/).length;
  const charCount = plainText.length;

  useEffect(() => {
    apiFetch<ChapterData>(base)
      .then((data) => {
        setContent(data.content);
        setSavedContent(data.content);
        setSha(data.sha);
        setComments(data.comments);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [base]);

  useEffect(() => {
    loadItalianSpellChecker()
      .then(setSpellChecker)
      .catch((err) => console.error("Correttore ortografico non disponibile", err));
  }, []);

  const editorExtensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      italianSpellcheck(spellChecker),
      livePreview(setFocusedHighlightId),
    ],
    [spellChecker]
  );

  async function handleSave() {
    const message = await promptMessage(`Aggiorna capitolo "${title}"`);
    if (message === null) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const result = await apiFetch<{ sha: string }>(base, {
        method: "PUT",
        body: JSON.stringify({
          action: "save-content",
          content,
          sha,
          message,
        }),
      });
      setSha(result.sha);
      setSavedContent(content);
      setStatus("Salvato su GitHub.");
      setCommitLogVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSaving(false);
    }
  }

  function handleHighlightSelection() {
    const view = editorRef.current?.view;
    if (!view) return;
    const { from: selectionStart, to: selectionEnd } = view.state.selection.main;
    if (selectionStart === selectionEnd) {
      setError("Seleziona prima il testo da evidenziare.");
      return;
    }
    const selected = view.state.sliceDoc(selectionStart, selectionEnd);
    const id = crypto.randomUUID().slice(0, 8);
    const wrapped =
      content.slice(0, selectionStart) +
      wrapWithHighlight(selected, id, selectedColor) +
      content.slice(selectionEnd);
    setContent(wrapped);
    setPendingHighlight({ id, text: selected, color: selectedColor });
    setCommentDraft("");
  }

  async function handleSaveHighlightAndComment() {
    if (!pendingHighlight) return;
    const message = await promptMessage(`Evidenzia sezione in "${title}"`);
    if (message === null) return;

    setSaving(true);
    setError(null);
    try {
      const saveResult = await apiFetch<{ sha: string }>(base, {
        method: "PUT",
        body: JSON.stringify({
          action: "save-content",
          content,
          sha,
          message,
        }),
      });
      setSha(saveResult.sha);
      setSavedContent(content);

      if (commentDraft.trim()) {
        const result = await apiFetch<{ comments: ChapterComment[] }>(base, {
          method: "PUT",
          body: JSON.stringify({
            action: "add-comment",
            highlightId: pendingHighlight.id,
            text: commentDraft.trim(),
          }),
        });
        setComments(result.comments);
      }
      setStatus("Evidenziazione e commento salvati.");
      setPendingHighlight(null);
      setCommentDraft("");
      setCommitLogVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSaving(false);
    }
  }

  function handleCommentClick(comment: ChapterComment) {
    setFocusedHighlightId(comment.highlightId);
    const view = editorRef.current?.view;
    if (!view) return;
    const range = findHighlightRange(content, comment.highlightId);
    if (!range) {
      setError("Il testo evidenziato collegato a questo commento non è più presente.");
      return;
    }
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      effects: EditorView.scrollIntoView(range.from, { y: "center" }),
    });
    view.focus();
  }

  async function handleDeleteComment(e: React.MouseEvent, comment: ChapterComment) {
    e.stopPropagation();
    if (
      !window.confirm(
        "Eliminare questo commento e la relativa evidenziazione? Il testo evidenziato resterà al suo posto, senza il colore."
      )
    )
      return;

    setDeletingCommentId(comment.id);
    setError(null);
    try {
      const otherCommentOnSameHighlight = comments.some(
        (c) => c.id !== comment.id && c.highlightId === comment.highlightId
      );
      if (!otherCommentOnSameHighlight) {
        const unwrapped = unwrapHighlight(content, comment.highlightId);
        if (unwrapped !== content) {
          const saveResult = await apiFetch<{ sha: string }>(base, {
            method: "PUT",
            body: JSON.stringify({
              action: "save-content",
              content: unwrapped,
              sha,
              message: "Rimuovi evidenziazione",
            }),
          });
          setContent(unwrapped);
          setSavedContent(unwrapped);
          setSha(saveResult.sha);
        }
      }

      const result = await apiFetch<{ comments: ChapterComment[] }>(base, {
        method: "PUT",
        body: JSON.stringify({ action: "delete-comment", commentId: comment.id }),
      });
      setComments(result.comments);
      setCommitLogVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setDeletingCommentId(null);
    }
  }

  const activeComments = comments.filter((c) => !c.resolved);
  const resolvedComments = comments.filter((c) => c.resolved);

  function renderCommentItem(comment: ChapterComment) {
    return (
      <li
        key={comment.id}
        role="button"
        tabIndex={0}
        onClick={() => handleCommentClick(comment)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCommentClick(comment);
          }
        }}
        title="Vai al testo evidenziato"
        className={`cursor-pointer rounded-lg border p-3 text-sm hover:border-zinc-400 ${
          focusedHighlightId === comment.highlightId
            ? "border-amber-400 bg-amber-50"
            : "border-zinc-200 bg-white"
        }`}
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{
              backgroundColor: getHighlightSwatch(
                getHighlightColor(content, comment.highlightId)
              ),
            }}
          />
          <span className="font-medium">{comment.author}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              comment.authorType === "ai-mentor"
                ? "bg-indigo-100 text-indigo-700"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {comment.authorType === "ai-mentor" ? "Mentore AI" : "Autore"}
          </span>
          {comment.resolved && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              Risolto
            </span>
          )}
          <span
            onClick={(e) => e.stopPropagation()}
            className="select-text font-mono text-[10px] text-zinc-400"
            title={comment.id}
          >
            #{comment.id.slice(0, 8)}
          </span>
          <button
            onClick={(e) => handleDeleteComment(e, comment)}
            disabled={deletingCommentId === comment.id}
            title="Elimina commento"
            className="ml-auto shrink-0 text-zinc-400 hover:text-red-600 disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1a.75.75 0 0 0-.75.75V2h-3a.75.75 0 0 0 0 1.5h.3l.6 11.1A2 2 0 0 0 7.9 16.5h4.2a2 2 0 0 0 2-1.9l.6-11.1h.3a.75.75 0 0 0 0-1.5h-3v-.25a.75.75 0 0 0-.75-.75h-2.5Zm-1.1 4a.5.5 0 0 1 .5.47l.3 8a.5.5 0 1 1-1 .06l-.3-8a.5.5 0 0 1 .5-.53Zm3.7.47a.5.5 0 1 0-1-.06l-.3 8a.5.5 0 1 0 1 .06l.3-8Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <p className="text-zinc-700">{comment.text}</p>
      </li>
    );
  }

  if (loading) {
    return <p className="px-6 py-10 text-sm text-zinc-500">Caricamento…</p>;
  }

  return (
    <div className="flex flex-1 gap-6 px-6 py-6">
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Colore evidenziazione">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                role="radio"
                aria-checked={selectedColor === color.id}
                title={color.label}
                onClick={() => setSelectedColor(color.id)}
                style={{ backgroundColor: color.swatch }}
                className={`h-6 w-6 rounded-full border-2 ${
                  selectedColor === color.id ? "border-zinc-900" : "border-transparent"
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleHighlightSelection}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Evidenzia selezione
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva su GitHub"}
          </button>
          {status && <span className="text-sm text-green-700">{status}</span>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}

        {pendingHighlight && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: getHighlightSwatch(pendingHighlight.color) }}
              />
              Commento per: <em>&ldquo;{pendingHighlight.text}&rdquo;</em>
            </p>
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Scrivi un commento su questa sezione (opzionale)"
              rows={2}
              className="mb-2 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveHighlightAndComment}
                disabled={saving}
                className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Conferma evidenziazione
              </button>
              <button
                onClick={() => setPendingHighlight(null)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end text-xs text-zinc-400">
          {wordCount} {wordCount === 1 ? "parola" : "parole"} · {charCount}{" "}
          {charCount === 1 ? "battuta" : "battute"}
        </div>

        <div className="min-h-[60vh] flex-1 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <CodeMirror
            ref={editorRef}
            value={content}
            onChange={setContent}
            extensions={editorExtensions}
            height="60vh"
            basicSetup={{ lineNumbers: false, foldGutter: false }}
            className="text-sm"
          />
        </div>
      </div>

      <aside className="w-96 shrink-0">
        <CollapsibleSection
          title="Commenti dell'editor"
          headerExtra={
            focusedHighlightId && (
              <button
                onClick={() => setFocusedHighlightId(null)}
                className="text-xs text-zinc-400 hover:text-zinc-700"
              >
                Mostra tutti
              </button>
            )
          }
        >
          <ul className="flex flex-col gap-3">
            {comments.length === 0 && (
              <li className="text-sm text-zinc-500">Nessun commento ancora.</li>
            )}
            {comments.length > 0 && activeComments.length === 0 && (
              <li className="text-sm text-zinc-500">Nessun commento aperto.</li>
            )}
            {activeComments.map(renderCommentItem)}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="Storico commenti risolti" defaultOpen={false}>
          <ul className="flex flex-col gap-3">
            {resolvedComments.length === 0 && (
              <li className="text-sm text-zinc-500">Nessun commento risolto finora.</li>
            )}
            {resolvedComments.map(renderCommentItem)}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="Personaggi nel capitolo">
          <ChapterCharacters
            owner={owner}
            repo={repo}
            romanzoSlug={romanzoSlug}
            file={file}
            content={content}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Confronta versioni" defaultOpen={false}>
          <ChapterVersionCompare
            owner={owner}
            repo={repo}
            romanzoSlug={romanzoSlug}
            file={file}
            currentContent={content}
            isDirty={content !== savedContent}
            refreshKey={commitLogVersion}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Log dei commit" defaultOpen={false}>
          <ChapterCommitLog
            owner={owner}
            repo={repo}
            romanzoSlug={romanzoSlug}
            file={file}
            refreshKey={commitLogVersion}
          />
        </CollapsibleSection>
      </aside>
      {commitDialog}
    </div>
  );
}
