"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  onClose,
  children,
  maxWidthClassName = "max-w-lg",
  fullscreen = false,
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
  fullscreen?: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${
        fullscreen ? "" : "p-4"
      }`}
      onClick={onClose}
    >
      <div
        className={
          fullscreen
            ? "flex h-full w-full flex-col overflow-y-auto bg-white p-5"
            : `flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-lg bg-white p-5 shadow-xl ${maxWidthClassName}`
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
