"use client";

import { useState, type FormEvent } from "react";
import Modal from "./Modal";

/**
 * «Salva versione»: chiede il messaggio del commit. `onSave` restituisce null se
 * è andato a buon fine, altrimenti il messaggio d'errore da mostrare nella finestra.
 */
export default function SaveDialog({
  open,
  onClose,
  defaultMessage,
  onSave,
  title = "Salva versione",
}: {
  open: boolean;
  onClose: () => void;
  defaultMessage: string;
  onSave: (message: string) => Promise<string | null>;
  title?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <SaveForm key={String(open)} defaultMessage={defaultMessage} onClose={onClose} onSave={onSave} />
    </Modal>
  );
}

function SaveForm({
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
