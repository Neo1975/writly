import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { anchorComment, parseComments } from "./comments";
import { MENTOR_SKILL_PATH, MENTOR_SKILL_VERSION, installedMentorVersion, mentorSkillFiles } from "./mentor-skill";
import { parseNote } from "./notes";
import { normalizeWorkStructure } from "./structure";

const files = new Map(mentorSkillFiles().map((f) => [f.path.split("/").pop()!, f.text]));
const blocks = (md: string, lang: string) => [...md.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);

describe("skill del mentore AI", () => {
  it("ha il front-matter di una skill di Claude Code e la versione riconoscibile", () => {
    const skill = files.get("SKILL.md")!;
    const fm = YAML.parse(/^---\n([\s\S]*?)\n---/.exec(skill)![1]);
    expect(fm.name).toBe("writly-mentore");
    expect(fm.description.length).toBeGreaterThan(100);
    expect(fm.description.length).toBeLessThanOrEqual(1024);
    expect(installedMentorVersion(skill)).toBe(MENTOR_SKILL_VERSION);
    expect(installedMentorVersion(null)).toBe(0);
    expect(mentorSkillFiles()[0].path).toBe(MENTOR_SKILL_PATH);
  });

  it("cita solo file della skill che esistono", () => {
    const skill = files.get("SKILL.md")!;
    for (const m of skill.matchAll(/`([a-z-]+\.md)`/g)) expect(files.has(m[1])).toBe(true);
  });

  it("gli esempi di formato.md sono leggibili da Writly", () => {
    const formato = files.get("formato.md")!;
    const [comments] = blocks(formato, "yaml").filter((b) => b.includes("commenti:"));
    const parsed = parseComments(comments, "esempio");
    expect(parsed.errori).toEqual([]);
    expect(parsed.commenti[0]).toMatchObject({ tipo: "mentore", autore: "Claude", categoria: "punto di vista" });
    const chapter = `Il vento portava sale. ${parsed.commenti[0].citazione}. Poi la lanterna si spense.`;
    expect(anchorComment(chapter, parsed.commenti[0])).not.toBeNull();

    const [structure] = blocks(formato, "yaml").filter((b) => b.includes("scene:"));
    const st = normalizeWorkStructure(YAML.parse(structure), "esempio");
    expect(st.scene[0]).toMatchObject({ capitolo: "capitolo-1.md", pov: "iris", personaggi: ["iris", "tomas"] });

    const [note] = blocks(formato, "markdown");
    expect(parseNote(note, "appunti/esempio.md")).toMatchObject({ tipo: "revisione", tag: ["mentore"], collegamenti: ["iris", "s4"] });
  });
});
