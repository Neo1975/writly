"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useCommitMessageDialog } from "@/hooks/useCommitMessageDialog";
import { renderMarkdown } from "@/lib/markdown";
import type { PersonalRepoSummary } from "@/lib/github";
import type { NoteCategory, NoteMeta } from "@/lib/types";

const CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: "personaggio", label: "Personaggio" },
  { value: "worldbuilding", label: "Worldbuilding" },
  { value: "parola", label: "Parola da approfondire" },
  { value: "spunto", label: "Spunto letterario" },
  { value: "generale", label: "Generale" },
];

export function Agendina() {
  const searchParams = useSearchParams();
  const requestedSlug = searchParams.get("note");

  const [repo, setRepo] = useState<PersonalRepoSummary | null | undefined>(undefined);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<NoteCategory>("generale");
  const [tagsInput, setTagsInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<NoteCategory | "tutte">("tutte");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState("");
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { promptMessage, dialog: commitDialog } = useCommitMessageDialog();

  useEffect(() => {
    apiFetch<{ repo: PersonalRepoSummary | null }>("/api/agendina/repo")
      .then((data) => setRepo(data.repo))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!repo) return;
    apiFetch<{ notes: NoteMeta[] }>("/api/agendina/notes")
      .then((data) => setNotes(data.notes))
      .catch((err) => setError(err.message));
  }, [repo]);

  useEffect(() => {
    if (!requestedSlug || !notes?.some((n) => n.slug === requestedSlug)) return;
    queueMicrotask(() => setSelectedSlug(requestedSlug));
  }, [requestedSlug, notes]);

  useEffect(() => {
    if (!selectedSlug) return;
    queueMicrotask(() => setLoadingNote(true));
    apiFetch<{ content: string; meta: NoteMeta | null }>(
      `/api/agendina/notes/${encodeURIComponent(selectedSlug)}`
    )
      .then((data) => {
        setContent(data.content);
        setTitle(data.meta?.title ?? selectedSlug);
        setCategory(data.meta?.category ?? "generale");
        setTagsInput((data.meta?.tags ?? []).join(", "));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingNote(false));
  }, [selectedSlug]);

  const titleToSlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const note of notes ?? []) {
      map.set(note.title.trim().toLowerCase(), note.slug);
    }
    return map;
  }, [notes]);

  useEffect(() => {
    renderMarkdown(content, {
      resolveNoteSlug: (noteTitle) => titleToSlug.get(noteTitle.toLowerCase()),
    }).then(setPreview);
  }, [content, titleToSlug]);

  async function handleCreateRepo() {
    setCreatingRepo(true);
    setError(null);
    try {
      const data = await apiFetch<{ repo: PersonalRepoSummary }>("/api/agendina/repo", {
        method: "POST",
      });
      setRepo(data.repo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setCreatingRepo(false);
    }
  }

  async function handleCreateNote() {
    setError(null);
    try {
      const data = await apiFetch<{ note: NoteMeta }>("/api/agendina/notes", {
        method: "POST",
        body: JSON.stringify({ title: "Nuova nota", category: "generale" }),
      });
      setNotes((prev) => [...(prev ?? []), data.note]);
      setSelectedSlug(data.note.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    }
  }

  async function handleSave() {
    if (!selectedSlug) return;
    const message = await promptMessage(`Aggiorna nota "${title}"`);
    if (message === null) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const data = await apiFetch<{ meta: NoteMeta }>(
        `/api/agendina/notes/${encodeURIComponent(selectedSlug)}`,
        {
          method: "PUT",
          body: JSON.stringify({ content, title, category, tags, message }),
        }
      );
      setNotes((prev) =>
        prev
          ? prev.map((n) => (n.slug === selectedSlug ? data.meta ?? n : n))
          : prev
      );
      setStatus("Nota salvata su GitHub.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedSlug) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/agendina/notes/${encodeURIComponent(selectedSlug)}`, {
        method: "DELETE",
      });
      setNotes((prev) => (prev ? prev.filter((n) => n.slug !== selectedSlug) : prev));
      setSelectedSlug(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setDeleting(false);
    }
  }

  const filteredNotes = (notes ?? []).filter((note) => {
    if (categoryFilter !== "tutte" && note.category !== categoryFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      note.title.toLowerCase().includes(q) ||
      note.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  if (repo === undefined) {
    return <p className="px-6 py-10 text-sm text-zinc-500">Caricamento…</p>;
  }

  if (repo === null) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-10">
        <p className="mb-4 text-sm text-zinc-600">
          La tua agendina personale vive in un repository GitHub privato dedicato,
          separato dalle saghe. Creala per iniziare a prendere appunti.
        </p>
        <button
          onClick={handleCreateRepo}
          disabled={creatingRepo}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {creatingRepo ? "Creazione in corso…" : "Crea la tua Agendina"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className={`${
          selectedSlug ? "hidden" : "flex"
        } w-full flex-col border-r border-zinc-200 p-4 md:flex md:w-72 md:shrink-0`}
      >
        <button
          onClick={handleCreateNote}
          className="mb-3 flex items-center justify-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm hover:border-zinc-500"
        >
          <Plus className="h-4 w-4" />
          Nuova nota
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per titolo o tag…"
          className="mb-2 rounded border border-zinc-300 px-2 py-1 text-xs"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as NoteCategory | "tutte")}
          className="mb-3 rounded border border-zinc-300 px-2 py-1 text-xs"
        >
          <option value="tutte">Tutte le categorie</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {notes === null && <p className="text-xs text-zinc-400">Caricamento…</p>}
          {notes?.length === 0 && (
            <p className="text-xs text-zinc-400">Nessuna nota ancora.</p>
          )}
          {filteredNotes.map((note) => (
            <button
              key={note.slug}
              onClick={() => setSelectedSlug(note.slug)}
              className={`rounded px-2 py-1.5 text-left text-sm ${
                selectedSlug === note.slug
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              <div className="truncate font-medium">{note.title}</div>
              <div
                className={`text-[10px] uppercase ${
                  selectedSlug === note.slug ? "text-zinc-300" : "text-zinc-400"
                }`}
              >
                {CATEGORIES.find((c) => c.value === note.category)?.label ?? note.category}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div
        className={`${
          selectedSlug ? "flex" : "hidden"
        } flex-1 flex-col overflow-y-auto p-4 sm:p-6 md:flex`}
      >
        {selectedSlug && (
          <button
            onClick={() => setSelectedSlug(null)}
            className="mb-3 text-left text-sm text-zinc-500 hover:text-zinc-900 md:hidden"
          >
            ← Note
          </button>
        )}
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {!selectedSlug && (
          <p className="text-sm text-zinc-500">
            Seleziona una nota a sinistra, oppure creane una nuova.
          </p>
        )}
        {selectedSlug && loadingNote && (
          <p className="text-sm text-zinc-500">Caricamento…</p>
        )}
        {selectedSlug && !loadingNote && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm font-medium"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as NoteCategory)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Tag separati da virgola"
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <CodeMirror
                value={content}
                onChange={setContent}
                extensions={[markdown()]}
                height="60vh"
                className="overflow-hidden rounded border border-zinc-300 text-sm"
              />
              <div
                className="prose prose-sm max-w-none overflow-y-auto rounded border border-zinc-200 p-3"
                style={{ height: "60vh" }}
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva su GitHub"}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-600 hover:border-red-500 disabled:opacity-50"
              >
                {deleting ? "Eliminazione…" : "Elimina nota"}
              </button>
              {status && <span className="text-sm text-green-700">{status}</span>}
            </div>
          </div>
        )}
      </div>
      {commitDialog}
    </div>
  );
}
