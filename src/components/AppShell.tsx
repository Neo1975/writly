import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { BranchProvider } from "@/contexts/BranchContext";

export function AppShell({
  user,
  children,
}: {
  user: { name: string | null; image: string | null; login: string | null };
  children: ReactNode;
}) {
  return (
    <BranchProvider>
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar user={user} />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </BranchProvider>
  );
}
