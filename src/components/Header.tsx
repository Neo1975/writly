import Link from "next/link";
import { signOut } from "@/auth";

export function Header({
  title,
  backHref,
}: {
  title: string;
  backHref?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            ← Indietro
          </Link>
        ) : (
          <Link href="/dashboard" className="text-sm font-semibold">
            Writly
          </Link>
        )}
        <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-900">
          Esci
        </button>
      </form>
    </header>
  );
}
