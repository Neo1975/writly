import Link from "next/link";

export function Header({
  title,
  backHref,
}: {
  title: string;
  backHref?: string;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-6 py-4">
      {backHref && (
        <Link
          href={backHref}
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Indietro
        </Link>
      )}
      <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
    </header>
  );
}
