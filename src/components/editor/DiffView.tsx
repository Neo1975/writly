"use client";

import { alignParagraphs, diffWords, type DiffOp } from "@/lib/text/diff";

/** Testo con le differenze a parole: aggiunte evidenziate, tolte barrate. */
export function InlineDiff({ ops, show = "both" }: { ops: DiffOp[]; show?: "both" | "old" | "new" }) {
  return (
    <>
      {ops.map((op, i) => {
        if (op.type === "equal") return <span key={i}>{op.text}</span>;
        if (op.type === "insert") return show === "old" ? null : <ins key={i}>{op.text}</ins>;
        return show === "new" ? null : <del key={i}>{op.text}</del>;
      })}
    </>
  );
}

/**
 * Confronto per paragrafi tra una versione più vecchia e una più recente.
 * In linea: un paragrafo alla volta con le differenze; affiancato: due colonne
 * allineate. `onRestore` (facoltativo) ripristina un paragrafo della vecchia versione.
 */
export default function DiffView({
  older,
  newer,
  layout,
  onRestore,
}: {
  older: string[];
  newer: string[];
  layout: "inline" | "affiancato";
  onRestore?: (olderIndex: number) => void;
}) {
  const pairs = alignParagraphs(older, newer);
  const changed = pairs.filter((p) => p.a === null || p.b === null || older[p.a] !== newer[p.b]).length;

  return (
    <div className={`diff diff-${layout}`}>
      <p className="small muted" style={{ margin: 0 }}>
        {changed === 0 ? "Nessuna differenza." : `${changed} ${changed === 1 ? "paragrafo diverso" : "paragrafi diversi"}.`}
      </p>
      {pairs.map((p, i) => {
        const a = p.a === null ? null : older[p.a];
        const b = p.b === null ? null : newer[p.b];
        const same = a !== null && a === b;
        const restore =
          onRestore && p.a !== null && !same ? (
            <button type="button" className="btn btn-small btn-ghost diff-restore" onClick={() => onRestore(p.a!)}>
              Ripristina questo paragrafo
            </button>
          ) : null;
        if (layout === "affiancato") {
          const ops = a !== null && b !== null ? diffWords(a, b) : null;
          return (
            <div key={i} className={`diff-row${same ? " is-same" : ""}`}>
              <div className={`diff-cell${a === null ? " is-empty" : ""}`}>
                {a === null ? "" : ops ? <InlineDiff ops={ops} show="old" /> : <del>{a}</del>}
                {restore}
              </div>
              <div className={`diff-cell${b === null ? " is-empty" : ""}`}>{b === null ? "" : ops ? <InlineDiff ops={ops} show="new" /> : <ins>{b}</ins>}</div>
            </div>
          );
        }
        return (
          <div key={i} className={`diff-para${same ? " is-same" : ""}`}>
            {a !== null && b !== null ? <InlineDiff ops={diffWords(a, b)} /> : a !== null ? <del>{a}</del> : <ins>{b}</ins>}
            {restore}
          </div>
        );
      })}
    </div>
  );
}
