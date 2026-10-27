"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "writly:branches";

function loadStored(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

interface BranchContextValue {
  getBranch: (owner: string, repo: string) => string | undefined;
  setBranch: (owner: string, repo: string, branch: string | undefined) => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<string, string>>(loadStored);

  const setBranch = useCallback(
    (owner: string, repo: string, branch: string | undefined) => {
      setMap((prev) => {
        const key = `${owner}/${repo}`;
        const next = { ...prev };
        if (branch) {
          next[key] = branch;
        } else {
          delete next[key];
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const getBranch = useCallback(
    (owner: string, repo: string) => map[`${owner}/${repo}`],
    [map]
  );

  return (
    <BranchContext.Provider value={{ getBranch, setBranch }}>
      {children}
    </BranchContext.Provider>
  );
}

function useBranchContext(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranchContext deve essere usato dentro BranchProvider");
  return ctx;
}

export function useCurrentBranch(owner: string, repo: string): string | undefined {
  const { getBranch } = useBranchContext();
  return getBranch(owner, repo);
}

export function useBranchSelection(): BranchContextValue {
  return useBranchContext();
}
