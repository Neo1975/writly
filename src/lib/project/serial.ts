import type { Arc, ChapterEntry, ChapterStatus, WordRange } from "./format";

/**
 * Pubblicazione a puntate (web novel): archi, lunghezza dei capitoli, scorta e ritmo di uscita.
 * Logica pura: nessuna lettura di file, nessun orologio nascosto (la data di oggi si passa).
 */

/** Data di oggi nel fuso dell'autore, come AAAA-MM-GG. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ——— Lunghezza del capitolo ———

export type RangeStatus = "sotto" | "dentro" | "sopra";

/** Dove cade il capitolo rispetto alla lunghezza voluta (null se non c'è un obiettivo o il capitolo è vuoto). */
export function rangeStatus(parole: number, range: WordRange | undefined | null): RangeStatus | null {
  if (!range || parole <= 0) return null;
  return parole < range.min ? "sotto" : parole > range.max ? "sopra" : "dentro";
}

// ——— Archi ———

export interface ArcGroup {
  /** null = capitoli senza arco (o con un arco che non esiste più). */
  arco: Arc | null;
  /** Capitoli nell'ordine dell'opera, con il loro numero (1 = primo capitolo dell'opera). */
  capitoli: { entry: ChapterEntry; numero: number }[];
}

/** Capitoli raggruppati per arco, nell'ordine degli archi (anche quelli ancora vuoti); in fondo quelli senza arco. */
export function groupByArc(capitoli: ChapterEntry[], archi: Arc[]): ArcGroup[] {
  const known = new Set(archi.map((a) => a.id));
  const groups: ArcGroup[] = archi.map((arco) => ({ arco, capitoli: [] }));
  const free: ArcGroup = { arco: null, capitoli: [] };
  capitoli.forEach((entry, i) => {
    const group = entry.arco && known.has(entry.arco) ? groups.find((g) => g.arco!.id === entry.arco)! : free;
    group.capitoli.push({ entry, numero: i + 1 });
  });
  return free.capitoli.length > 0 ? [...groups, free] : groups;
}

// ——— Scorta e ritmo di uscita ———

export interface PublicationChapter {
  stato: ChapterStatus | "mancante";
  /** Giorno di uscita, se c'è. */
  pubblicato: string | null;
}

export interface PublicationStats {
  /** Già usciti (stato «pubblicato» con data passata o senza data). */
  pubblicati: number;
  /** Con la data di uscita nel futuro. */
  programmati: number;
  /** Scritti o rivisti, ancora senza data di uscita. */
  pronti: number;
  /** Capitoli in magazzino: pronti più programmati. */
  scorta: number;
  ultimaUscita: string | null;
  prossimaUscita: string | null;
  /** Uscite negli ultimi 28 giorni (oggi compreso). */
  ultimi28Giorni: number;
  /** Ritmo medio, calcolato sugli ultimi 28 giorni (null se non è uscito niente). */
  perSettimana: number | null;
  /** Per quante settimane basta la scorta a quel ritmo (null se non c'è un ritmo). */
  settimaneDiScorta: number | null;
}

export const WINDOW_DAYS = 28;

export function publicationStats(chapters: PublicationChapter[], today: string): PublicationStats {
  const windowStart = addDays(today, -(WINDOW_DAYS - 1));
  let pubblicati = 0;
  let programmati = 0;
  let pronti = 0;
  let ultimi28 = 0;
  let last: string | null = null;
  let next: string | null = null;
  for (const c of chapters) {
    if (c.stato === "pubblicato") {
      if (c.pubblicato && c.pubblicato > today) {
        programmati++;
        if (!next || c.pubblicato < next) next = c.pubblicato;
      } else {
        pubblicati++;
        if (c.pubblicato) {
          if (!last || c.pubblicato > last) last = c.pubblicato;
          if (c.pubblicato >= windowStart) ultimi28++;
        }
      }
    } else if (c.stato === "scritto" || c.stato === "revisionato") {
      pronti++;
    }
  }
  const perSettimana = ultimi28 > 0 ? ultimi28 / (WINDOW_DAYS / 7) : null;
  const scorta = pronti + programmati;
  return {
    pubblicati,
    programmati,
    pronti,
    scorta,
    ultimaUscita: last,
    prossimaUscita: next,
    ultimi28Giorni: ultimi28,
    perSettimana,
    settimaneDiScorta: perSettimana ? scorta / perSettimana : null,
  };
}
