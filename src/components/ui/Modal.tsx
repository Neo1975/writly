"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Finestra modale accessibile basata su <dialog> (focus, Esc e sfondo gestiti dal browser). */
export default function Modal({
  open,
  onClose,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={`modal${wide ? " modal-wide" : ""}`} aria-label={title} onClose={onClose}>
      {open && (
        <div className="modal-body">
          <h2>{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
