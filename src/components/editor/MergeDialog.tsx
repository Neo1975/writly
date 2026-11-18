"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { applyChoices, diffWords, joinParagraphs, paragraphChunks, splitParagraphs, type ChunkChoice } from "@/lib/text/diff";
import { InlineDiff } from "./DiffView";

export interface MergeRequest {
  title: string;
  intro: string;
  mineLabel: string;
  theirsLabel: string;
  mine: string;
  theirs: string;
}

/**
 * Unione di due versioni dello stesso capitolo, blocco per blocco: per ogni
 * passaggio diverso l'autore sceglie la sua versione, l'altra o entrambe.
 * Nulla viene salvato: il risultato va nell'editor e diventa una versione con «Salva».
 */
export default function MergeDialog({ request, onApply, onClose }: { request: MergeRequest | null; onApply: (merged: string) => void; onClose: () => void }) {
  return (
    <Modal open={!!request} onClose={onClose} title={request?.title ?? "Unisci"} wide>
      {request && <MergeBody key={request.mine + request.theirs} request={request} onApply={onApply} onClose={onClose} />}
    </Modal>
  );
}

function MergeBody({ request, onApply, onClose }: { request: MergeRequest; onApply: (merged: string) => void; onClose: () => void }) {
  const chunks = useMemo(() => paragraphChunks(splitParagraphs(request.mine), splitParagraphs(request.theirs)), [request]);
  const diffs = chunks.filter((c) => c.kind === "diff").length;
  const [choices, setChoices] = useState<ChunkChoice[]>(() => new Array(diffs).fill("mine"));

  const apply = (all?: ChunkChoice) => onApply(joinParagraphs(applyChoices(chunks, all ? new Array(diffs).fill(all) : choices)));

  let d = -1;
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>{request.intro}</p>
      {diffs === 0 ? (
        <div className="notice notice-ok">Le due versioni sono uguali.</div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {diffs} {diffs === 1 ? "passaggio diverso" : "passaggi diversi"}. Per ognuno scegli quale tenere; i paragrafi uguali restano come sono.
        </p>
      )}
      <div className="diff-scroll merge">
        {chunks.map((c, i) => {
          if (c.kind === "same") {
            return (
              <p key={i} className="merge-same serif">
                {c.text.length === 1 ? c.text[0].slice(0, 160) : `${c.text.length} paragrafi uguali`}
                {c.text.length === 1 && c.text[0].length > 160 ? "…" : ""}
              </p>
            );
          }
          const k = ++d;
          const mine = c.mine.join("\n\n");
          const theirs = c.theirs.join("\n\n");
          const ops = diffWords(mine, theirs);
          return (
            <fieldset key={i} className="merge-chunk">
              <legend className="sr-only">Passaggio diverso {k + 1}</legend>
              <div className="diff-row">
                <div className="diff-cell">
                  <div className="small muted">{request.mineLabel}</div>
                  <div className="serif">{mine ? <InlineDiff ops={ops} show="old" /> : <em className="muted">(niente)</em>}</div>
                </div>
                <div className="diff-cell">
                  <div className="small muted">{request.theirsLabel}</div>
                  <div className="serif">{theirs ? <InlineDiff ops={ops} show="new" /> : <em className="muted">(niente)</em>}</div>
                </div>
              </div>
              <div className="row small">
                {(
                  [
                    ["mine", request.mineLabel],
                    ["theirs", request.theirsLabel],
                    ["both", "Entrambe"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="row" style={{ gap: 4 }}>
                    <input type="radio" name={`chunk-${k}`} checked={choices[k] === value} onChange={() => setChoices(choices.map((x, j) => (j === k ? value : x)))} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" style={{ marginRight: "auto" }} onClick={onClose}>
          Annulla
        </button>
        <button type="button" className="btn" onClick={() => apply("mine")}>
          Tieni solo «{request.mineLabel}»
        </button>
        <button type="button" className="btn" onClick={() => apply("theirs")}>
          Tieni solo «{request.theirsLabel}»
        </button>
        <button type="button" className="btn btn-primary" onClick={() => apply()} disabled={diffs === 0}>
          Applica le scelte
        </button>
      </div>
    </div>
  );
}
