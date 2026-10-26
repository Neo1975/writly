"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useCommitMessageDialog } from "@/hooks/useCommitMessageDialog";
import { PDF_TEMPLATES } from "@/lib/pdf/templates";
import type { CapitoloSummary } from "@/lib/domain";
import type { PdfPageSize, PdfSettings, PdfTemplateId } from "@/lib/types";

const PAGE_SIZES: PdfPageSize[] = ["A5", "A4", "LETTER"];

async function downloadPdf(
  url: string,
  body: { settings: PdfSettings; mode: "standard" | "booklet" },
  fallbackName: string
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `Generazione PDF fallita (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function PdfExport({
  owner,
  repo,
  slug,
  romanzoTitle,
}: {
  owner: string;
  repo: string;
  slug: string;
  romanzoTitle: string;
}) {
  const settingsBase = `/api/sagas/${owner}/${repo}/romanzi/${slug}/pdf-settings`;
  const capitoliBase = `/api/sagas/${owner}/${repo}/romanzi/${slug}/capitoli`;
  const pdfBase = `/api/sagas/${owner}/${repo}/romanzi/${slug}/pdf`;

  const [settings, setSettings] = useState<PdfSettings | null>(null);
  const [capitoli, setCapitoli] = useState<CapitoloSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<"standard" | "booklet" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { promptMessage, dialog: commitDialog } = useCommitMessageDialog();

  useEffect(() => {
    Promise.all([
      apiFetch<{ settings: PdfSettings }>(settingsBase),
      apiFetch<{ capitoli: CapitoloSummary[] }>(capitoliBase),
    ])
      .then(([settingsData, capitoliData]) => {
        setSettings(settingsData.settings);
        setCapitoli(capitoliData.capitoli);
      })
      .catch((err) => setError(err.message));
  }, [settingsBase, capitoliBase]);

  function patch(update: Partial<PdfSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...update } : prev));
  }

  function toggleChapter(file: string) {
    setSettings((prev) => {
      if (!prev) return prev;
      const current = prev.chapterFiles ?? capitoli.map((c) => c.file);
      const next = current.includes(file)
        ? current.filter((f) => f !== file)
        : [...current, file];
      return { ...prev, chapterFiles: next.length === capitoli.length ? undefined : next };
    });
  }

  async function handleSaveSettings() {
    if (!settings) return;
    const message = await promptMessage("Aggiorna impostazioni PDF");
    if (message === null) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch(settingsBase, {
        method: "PUT",
        body: JSON.stringify({ settings, message }),
      });
      setStatus("Impostazioni PDF salvate su GitHub.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate(mode: "standard" | "booklet") {
    if (!settings) return;
    setGenerating(mode);
    setError(null);
    setStatus(null);
    try {
      const suffix = mode === "booklet" ? "-opuscolo" : "";
      await downloadPdf(pdfBase, { settings, mode }, `${romanzoTitle}${suffix}.pdf`);
      setStatus(
        mode === "booklet"
          ? "PDF opuscolo generato: stampa fronte-retro (capovolgimento lato lungo), piega e cuci al centro."
          : "PDF generato."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setGenerating(null);
    }
  }

  if (!settings) {
    return <p className="px-6 py-10 text-sm text-zinc-500">Caricamento…</p>;
  }

  const selectedFiles = settings.chapterFiles ?? capitoli.map((c) => c.file);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => handleGenerate("standard")}
          disabled={generating !== null}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {generating === "standard" ? "Generazione…" : "Scarica PDF"}
        </button>
        <button
          onClick={() => handleGenerate("booklet")}
          disabled={generating !== null}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500 disabled:opacity-50"
        >
          {generating === "booklet"
            ? "Generazione…"
            : "Scarica versione opuscolo (fronte-retro)"}
        </button>
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva impostazioni su GitHub"}
        </button>
      </div>
      {status && <p className="mb-4 text-sm text-green-700">{status}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Template</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PDF_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => patch({ templateId: template.id as PdfTemplateId })}
              className={`rounded-lg border p-3 text-left text-sm ${
                settings.templateId === template.id
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <p className="font-medium">{template.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{template.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-5">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Formato pagina
          <select
            value={settings.pageSize}
            onChange={(e) => patch({ pageSize: e.target.value as PdfPageSize })}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-zinc-400">
            Ignorato nella versione opuscolo, sempre basata su A5.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Nome autore (copertina)
          <input
            value={settings.authorName ?? ""}
            onChange={(e) => patch({ authorName: e.target.value || undefined })}
            placeholder="Nome e cognome / pseudonimo"
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Dimensione testo (pt)
          <input
            type="number"
            value={settings.fontSize ?? ""}
            onChange={(e) =>
              patch({ fontSize: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="predefinita dal template"
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Interlinea
          <input
            type="number"
            step="0.1"
            value={settings.lineHeight ?? ""}
            onChange={(e) =>
              patch({ lineHeight: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="predefinita dal template"
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Margini (mm)
          <input
            type="number"
            value={settings.marginMm ?? ""}
            onChange={(e) =>
              patch({ marginMm: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="20"
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>

        <div className="flex flex-col gap-2 text-xs text-zinc-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.includeCoverPage}
              onChange={(e) => patch({ includeCoverPage: e.target.checked })}
            />
            Copertina
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.includeToc}
              onChange={(e) => patch({ includeToc: e.target.checked })}
            />
            Indice
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Capitoli da esportare</h2>
        {capitoli.length === 0 && (
          <p className="text-sm text-zinc-500">Nessun capitolo in questo romanzo.</p>
        )}
        <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-4">
          {capitoli.map((c) => (
            <label key={c.file} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedFiles.includes(c.file)}
                onChange={() => toggleChapter(c.file)}
              />
              <span className="text-zinc-400">{String(c.order).padStart(2, "0")}</span>
              {c.title}
            </label>
          ))}
        </div>
      </section>
      {commitDialog}
    </div>
  );
}
