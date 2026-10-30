import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/Header";
import { Agendina } from "@/components/Agendina";

export default async function AgendinaPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Agendina" backHref="/dashboard" />
      <Suspense fallback={<p className="px-6 py-10 text-sm text-zinc-500">Caricamento…</p>}>
        <Agendina />
      </Suspense>
    </div>
  );
}
