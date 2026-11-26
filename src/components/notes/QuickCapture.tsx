"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import { api, projectApi } from "@/lib/client/api";

const PROJECT_PATH = /^\/progetto\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:\/|$)/;

/**
 * Cattura rapida di un'idea da qualsiasi pagina (pulsante o Alt+Maiusc+N).
 * Dentro un progetto la salva tra i suoi appunti, altrimenti tra quelli globali;
 * in entrambi i casi «da smistare». La prima riga diventa il titolo.
 */
export default function QuickCapture() {
  const pathname = usePathname();
  const match = PROJECT_PATH.exec(pathname ?? "");
  const project = match ? { owner: match[1], repo: match[2] } : null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyN") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)} title="Cattura un'idea (Alt+Maiusc+N)">
        + Idea
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cattura un'idea">
        {open && <CaptureForm project={project} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function CaptureForm({ project, onClose }: { project: { owner: string; repo: string } | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [where, setWhere] = useState<"progetto" | "libreria">(project ? "progetto" : "libreria");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const [first, ...rest] = text.trim().split("\n");
    const titolo = first.trim().slice(0, 200);
    const data = { titolo, tipo: "idea", inbox: true, testo: rest.join("\n").trim() };
    setBusy(true);
    setError("");
    try {
      if (where === "progetto" && project) {
        await api(`${projectApi(project.owner, project.repo)}/schede`, { method: "POST", json: { azione: "appunto", data } });
        setDone(`Salvata tra gli appunti di ${project.repo}, da smistare.`);
      } else {
        await api("/api/appunti", { method: "POST", json: { azione: "salva", data } });
        setDone("Salvata tra gli appunti globali, da smistare.");
      }
      setText("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="qc-text">L&apos;idea</label>
        <textarea
          id="qc-text"
          className="textarea"
          rows={5}
          maxLength={20000}
          required
          autoFocus
          placeholder={"La prima riga è il titolo.\nIl resto, se c'è, il testo."}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDone(null);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
          }}
        />
        <span className="hint">Ctrl/⌘+Invio per salvare.</span>
      </div>
      {project && (
        <fieldset className="fieldset">
          <legend>Dove</legend>
          <label className="row small" style={{ gap: 6 }}>
            <input type="radio" name="qc-where" checked={where === "progetto"} onChange={() => setWhere("progetto")} />
            Appunti di questo progetto ({project.repo})
          </label>
          <label className="row small" style={{ gap: 6 }}>
            <input type="radio" name="qc-where" checked={where === "libreria"} onChange={() => setWhere("libreria")} />
            Appunti globali
          </label>
        </fieldset>
      )}
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {done && (
        <div className="notice notice-ok" role="status">
          {done}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Chiudi
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
          {busy ? "Salvo…" : "Salva idea"}
        </button>
      </div>
    </form>
  );
}
