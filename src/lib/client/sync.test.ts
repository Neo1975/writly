import { describe, expect, it } from "vitest";
import { parseChapter } from "@/lib/project/format";
import { ClientApiError } from "./api";
import { parseDraftKey, type Draft, type DraftEntry } from "./drafts";
import { chapterPage, syncAll, syncEntry, type SyncIO } from "./sync";

const REMOTE_TEXT = "---\nid: c1\nstato: bozza\n---\n\nIl treno partì.\n";

function entry(over: Omit<Partial<DraftEntry>, "draft"> & { draft?: Partial<Draft> } = {}): DraftEntry {
  const { draft, ...rest } = over;
  return {
    owner: "neo",
    repo: "libro",
    path: "opere/romanzo/capitoli/uno.md",
    variant: null,
    draft: { body: "Il treno partì. Poi corse.", stato: "bozza", baseSha: "sha1", updatedAt: 1000, ...draft },
    ...rest,
  };
}

/** IO finto: un capitolo su «GitHub» e un registro di quel che succede. */
function fakeIO(opts: { remote?: { text: string; sha: string } | Error; writeError?: Error; latest?: Draft | null } = {}) {
  const log: string[] = [];
  const writes: { text: string; sha: string; message: string }[] = [];
  const saved: Draft[] = [];
  const packed: { text: string; sha: string }[] = [];
  const io: SyncIO = {
    async readRemote() {
      const r = opts.remote ?? { text: REMOTE_TEXT, sha: "sha1" };
      if (r instanceof Error) throw r;
      return r;
    },
    async writeRemote(_e, text, sha, message) {
      if (opts.writeError) throw opts.writeError;
      writes.push({ text, sha, message });
      return "sha2";
    },
    async loadDraft() {
      return opts.latest === undefined ? null : opts.latest;
    },
    async saveDraft(_e, d) {
      saved.push(d);
      log.push("salva-bozza");
    },
    async clearDraft() {
      log.push("cancella-bozza");
    },
    async updatePacked(_e, f) {
      packed.push(f);
    },
  };
  return { io, log, writes, saved, packed };
}

describe("allineamento di una bozza con GitHub", () => {
  it("scrive una versione quando GitHub è ancora dove la bozza è partita, tenendo l'id del capitolo", async () => {
    const t = fakeIO();
    const r = await syncEntry(entry({ draft: { stato: "revisionato" } }), t.io);
    expect(r.outcome).toBe("salvato");
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0].sha).toBe("sha1");
    expect(t.writes[0].message).toContain("senza rete");
    const doc = parseChapter(t.writes[0].text);
    expect(doc.meta).toEqual({ id: "c1", stato: "revisionato" });
    expect(doc.body.trim()).toBe("Il treno partì. Poi corse.");
    expect(t.log).toEqual(["cancella-bozza"]);
    expect(t.packed).toEqual([{ text: t.writes[0].text, sha: "sha2" }]);
  });

  it("non tocca niente se su GitHub il capitolo è cambiato: la bozza resta per l'unione", async () => {
    const t = fakeIO({ remote: { text: REMOTE_TEXT + "\nAltro.\n", sha: "sha9" } });
    const r = await syncEntry(entry(), t.io);
    expect(r.outcome).toBe("conflitto");
    expect(t.writes).toHaveLength(0);
    expect(t.log).toEqual([]);
  });

  it("riconosce il conflitto anche quando è GitHub a rispondere 409 al salvataggio", async () => {
    const t = fakeIO({ writeError: new ClientApiError(409, "cambiato") });
    expect((await syncEntry(entry(), t.io)).outcome).toBe("conflitto");
    expect(t.log).toEqual([]);
  });

  it("non crea versioni inutili se il testo è già quello di GitHub", async () => {
    const t = fakeIO();
    const r = await syncEntry(entry({ draft: { body: "Il treno partì.\n" } }), t.io);
    expect(r.outcome).toBe("gia-allineato");
    expect(t.writes).toHaveLength(0);
    expect(t.log).toEqual(["cancella-bozza"]);
  });

  it("senza rete non fa nulla e lo dice", async () => {
    const t = fakeIO({ remote: new ClientApiError(0, "Connessione assente") });
    expect((await syncEntry(entry(), t.io)).outcome).toBe("rete");
    expect(t.log).toEqual([]);
  });

  it("capitolo sparito da GitHub, accesso scaduto: lascia la bozza e spiega", async () => {
    expect((await syncEntry(entry(), fakeIO({ remote: new ClientApiError(404, "non trovato") }).io)).outcome).toBe("assente");
    const r = await syncEntry(entry(), fakeIO({ remote: new ClientApiError(401, "Accedi di nuovo") }).io);
    expect(r.outcome).toBe("errore");
    expect(r.message).toBe("Accedi di nuovo");
  });

  it("se la bozza è cambiata mentre si salvava, la nuova riparte dalla versione appena scritta", async () => {
    const newer: Draft = { body: "Il treno partì. Poi corse. E ancora.", stato: "bozza", baseSha: "sha1", updatedAt: 2000 };
    const t = fakeIO({ latest: newer });
    expect((await syncEntry(entry(), t.io)).outcome).toBe("salvato");
    expect(t.saved).toEqual([{ ...newer, baseSha: "sha2" }]);
    expect(t.log).toEqual(["salva-bozza"]);
  });

  it("per una variante non tocca la copia scaricata (che è della versione principale)", async () => {
    const t = fakeIO();
    await syncEntry(entry({ variant: "variante/finale-alternativo" }), t.io);
    expect(t.packed).toHaveLength(0);
  });
});

describe("allineamento di tutte le bozze", () => {
  it("si ferma alla prima volta che manca la rete e salta le bozze aperte nell'editor", async () => {
    const a = entry({ path: "opere/romanzo/capitoli/uno.md" });
    const b = entry({ path: "opere/romanzo/capitoli/due.md" });
    const c = entry({ path: "opere/romanzo/capitoli/tre.md" });
    let calls = 0;
    const t = fakeIO();
    const io: SyncIO = {
      ...t.io,
      async readRemote(e) {
        calls++;
        if (e.path.endsWith("due.md")) throw new ClientApiError(0, "Connessione assente");
        return { text: REMOTE_TEXT, sha: "sha1" };
      },
    };
    const results = await syncAll([a, b, c], io, (e) => e.path.endsWith("uno.md"));
    expect(results.map((r) => r.outcome)).toEqual(["rete"]);
    expect(calls).toBe(1);
  });
});

describe("chiavi delle bozze e pagine dei capitoli", () => {
  it("legge progetto, capitolo e variante dalla chiave", () => {
    expect(parseDraftKey("writly:bozza:neo/libro/opere/romanzo/capitoli/uno.md")).toEqual({
      owner: "neo",
      repo: "libro",
      path: "opere/romanzo/capitoli/uno.md",
      variant: null,
    });
    expect(parseDraftKey("writly:bozza:neo/libro/opere/romanzo/capitoli/uno.md@variante/finale")).toMatchObject({ variant: "variante/finale" });
    expect(parseDraftKey("writly:struttura:neo/libro/romanzo")).toBeNull();
    expect(parseDraftKey("writly:bozza:neo/libro/mondo/regole.yaml")).toBeNull();
  });

  it("indirizzo del capitolo", () => {
    expect(chapterPage({ owner: "neo", repo: "libro", path: "opere/romanzo/capitoli/uno.md" })).toBe("/progetto/neo/libro/romanzo/uno");
  });
});
