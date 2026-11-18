/**
 * Imposizione a opuscolo: in che ordine stampare le pagine perché, piegando i
 * fogli a metà, si legga il libro nell'ordine giusto.
 *
 * Ogni foglio porta 4 pagine (2 sul fronte, 2 sul retro). Con un solo fascicolo
 * tutti i fogli si piegano insieme; con le segnature il libro è diviso in
 * fascicoli di N fogli, da cucire uno dopo l'altro.
 */

export interface SheetSide {
  /** Numero di pagina (da 1) o null per una pagina bianca aggiunta. */
  left: number | null;
  right: number | null;
}

export interface ImposedSheet {
  /** Fascicolo (da 1). */
  signature: number;
  /** Foglio dentro il fascicolo (0 = il più esterno). */
  index: number;
  front: SheetSide;
  back: SheetSide;
  /**
   * Quanto è interno il foglio nel suo fascicolo (0 = esterno, 1 = centrale):
   * serve alla compensazione del creep.
   */
  depth: number;
}

export interface Imposition {
  /** Pagine dopo l'aggiunta delle bianche (multiplo di 4). */
  totalPages: number;
  blanks: number;
  sheets: ImposedSheet[];
}

/** `sheetsPerSignature` = 0 → un unico fascicolo. */
export function impose(pageCount: number, sheetsPerSignature = 0): Imposition {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("Servono almeno una pagina.");
  const totalPages = Math.ceil(pageCount / 4) * 4;
  const perSig = sheetsPerSignature > 0 ? sheetsPerSignature * 4 : totalPages;
  const page = (n: number) => (n <= pageCount ? n : null);
  const sheets: ImposedSheet[] = [];
  let signature = 0;
  for (let first = 1; first <= totalPages; first += perSig) {
    signature++;
    const size = Math.min(perSig, totalPages - first + 1);
    const count = size / 4;
    const at = (local: number) => page(first + local - 1);
    for (let i = 0; i < count; i++) {
      sheets.push({
        signature,
        index: i,
        front: { left: at(size - 2 * i), right: at(2 * i + 1) },
        back: { left: at(2 * i + 2), right: at(size - 2 * i - 1) },
        depth: count > 1 ? i / (count - 1) : 0,
      });
    }
  }
  return { totalPages, blanks: totalPages - pageCount, sheets };
}

export const SHEET_SIZES = {
  A4: { nome: "A4 piegato in A5", larghezza: 297, altezza: 210 },
  A3: { nome: "A3 piegato in A4", larghezza: 420, altezza: 297 },
} as const;
export type SheetSize = keyof typeof SHEET_SIZES;

/**
 * Fronte/retro: con il ribaltamento sul lato corto i retro si stampano dritti;
 * sul lato lungo (fogli orizzontali) la stampante li capovolge, quindi vanno
 * ruotati di 180° perché tornino dritti.
 */
export type DuplexFlip = "corto" | "lungo";
