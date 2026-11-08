"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function CollapsibleSection({
  title,
  defaultOpen = true,
  headerExtra,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-zinc-200 pb-4 last:border-b-0 last:pb-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-zinc-700"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
          {title}
        </button>
        {headerExtra}
      </div>
      {open && children}
    </div>
  );
}
