import type { Character, Scene, TimelineEvent } from "./types";

const CHARACTER_ROLES = new Set(["protagonista", "antagonista", "comprimario", "altro"]);
const SCENE_STATUSES = new Set(["bozza", "revisione", "finale"]);

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function isCharacter(value: unknown): value is Character {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    isString(c.id) &&
    isString(c.name) &&
    typeof c.role === "string" &&
    CHARACTER_ROLES.has(c.role) &&
    typeof c.order === "number" &&
    isOptionalString(c.description) &&
    isOptionalString(c.personality) &&
    isOptionalString(c.backstory) &&
    isOptionalString(c.goal) &&
    isOptionalString(c.arc) &&
    (c.relationships === undefined ||
      (Array.isArray(c.relationships) &&
        c.relationships.every(
          (r) =>
            typeof r === "object" &&
            r !== null &&
            isString((r as Record<string, unknown>).personaggioId) &&
            isString((r as Record<string, unknown>).relazione)
        )))
  );
}

export function isScene(value: unknown): value is Scene {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isString(s.id) &&
    isString(s.title) &&
    typeof s.status === "string" &&
    SCENE_STATUSES.has(s.status) &&
    typeof s.order === "number" &&
    isStringArray(s.personaggi) &&
    isOptionalString(s.chapterFile) &&
    isOptionalString(s.pov) &&
    isOptionalString(s.luogo) &&
    isOptionalString(s.tempo) &&
    isOptionalString(s.obiettivo) &&
    isOptionalString(s.conflitto) &&
    isOptionalString(s.esito) &&
    isOptionalString(s.highlightId)
  );
}

export function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    isString(e.id) &&
    isString(e.title) &&
    typeof e.order === "number" &&
    isStringArray(e.personaggi) &&
    isOptionalString(e.description) &&
    isOptionalString(e.tempo) &&
    isOptionalString(e.romanzoSlug) &&
    isOptionalString(e.sceneId)
  );
}
