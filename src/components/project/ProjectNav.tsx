import Link from "next/link";

export type ProjectSection = "opere" | "struttura" | "personaggi" | "mondo" | "appunti" | "esporta" | "panoramica";

/** Intestazione comune alle pagine di un progetto: titolo e schede di navigazione. */
export default function ProjectNav({
  owner,
  repo,
  title,
  current,
  subtitle,
  asHeading = false,
}: {
  owner: string;
  repo: string;
  title: string;
  current: ProjectSection;
  subtitle?: string;
  /** Il titolo del progetto è il titolo della pagina (h1). */
  asHeading?: boolean;
}) {
  const base = `/progetto/${owner}/${repo}`;
  const tabs: { id: ProjectSection; label: string; href: string }[] = [
    { id: "opere", label: "Opere e capitoli", href: base },
    { id: "personaggi", label: "Personaggi", href: `${base}/personaggi` },
    { id: "mondo", label: "Mondo", href: `${base}/mondo` },
    { id: "appunti", label: "Appunti e glossario", href: `${base}/appunti` },
    { id: "panoramica", label: "Panoramica", href: `${base}/panoramica` },
    { id: "esporta", label: "Esporta", href: `${base}/esporta` },
  ];
  return (
    <div className="project-head">
      <div>
        <Link href="/" className="small">
          ← Libreria
        </Link>
        {asHeading ? <h1 className="project-title serif">{title}</h1> : <div className="project-title serif">{title}</div>}
        {subtitle && <div className="small muted">{subtitle}</div>}
      </div>
      <nav className="tabs" aria-label="Sezioni del progetto">
        {tabs.map((t) => (
          <Link key={t.id} href={t.href} className="tab" aria-current={t.id === current || (current === "struttura" && t.id === "opere") ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
