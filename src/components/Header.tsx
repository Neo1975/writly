import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function Header({
  title,
  backHref,
}: {
  title: string;
  backHref?: string;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
      {backHref && (
        <Link
          href={backHref}
          className="flex shrink-0 items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-zinc-900">
        {title}
      </h1>
    </header>
  );
}
