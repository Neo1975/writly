import { describe, expect, it } from "vitest";
import { chapterForPlatform } from "./platform";

const MD = `Iris scese al molo.

Il mare era *grigio* e **freddo**, e "tutto" <taceva>.

---

Dopo, la sera.

> Una citazione
> su due righe

- uno
- due
`;

describe("capitolo per le piattaforme: testo semplice", () => {
  it("paragrafi separati da una riga vuota, niente simboli di formattazione, cambio di scena con * * *", () => {
    const out = chapterForPlatform({ titolo: "Al molo", markdown: MD }, "testo");
    expect(out).toContain("Iris scese al molo.\n\nIl mare era grigio e freddo, e \"tutto\" <taceva>.\n\n* * *\n\nDopo, la sera.");
    expect(out).not.toMatch(/[*_]grigio|\*\*/);
    expect(out).toContain("• uno\n\n• due");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("titolo e note solo se richiesti, in testa e in coda separati da * * *", () => {
    const out = chapterForPlatform({ titolo: "Al molo", markdown: "Testo.", notaIniziale: "Buona lettura!", notaFinale: "Grazie.\n\nAlla prossima.", conTitolo: true }, "testo");
    expect(out).toBe("Al molo\n\nBuona lettura!\n\n* * *\n\nTesto.\n\n* * *\n\nGrazie.\n\nAlla prossima.\n");
    expect(chapterForPlatform({ titolo: "Al molo", markdown: "Testo." }, "testo")).toBe("Testo.\n");
  });
});

describe("capitolo per le piattaforme: HTML", () => {
  it("paragrafi, corsivo e grassetto, cambio di scena, citazioni ed elenchi; il testo è protetto dai simboli HTML", () => {
    const out = chapterForPlatform({ titolo: "Al molo", markdown: MD }, "html");
    expect(out).toContain("<p>Iris scese al molo.</p>");
    expect(out).toContain("<em>grigio</em>");
    expect(out).toContain("<strong>freddo</strong>");
    expect(out).toContain("&lt;taceva&gt;");
    expect(out).toContain("&quot;tutto&quot;");
    expect(out).toContain("<hr />");
    expect(out).toContain("<blockquote>");
    expect(out).toContain("<ul><li>uno</li><li>due</li></ul>");
    expect(out).not.toContain("<h2>");
  });

  it("note e titolo in HTML, con il testo delle note protetto", () => {
    const out = chapterForPlatform({ titolo: "Al <molo>", markdown: "Testo.", notaIniziale: "Ciao & benvenuti", notaFinale: "Fine", conTitolo: true }, "html");
    expect(out).toBe("<h2>Al &lt;molo&gt;</h2>\n<p><em>Ciao &amp; benvenuti</em></p>\n<hr />\n<p>Testo.</p>\n<hr />\n<p><em>Fine</em></p>\n");
  });
});
