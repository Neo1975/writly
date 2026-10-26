export interface Saga {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
}

export type RomanzoStatus = "bozza" | "in-corso" | "completo";

export interface Romanzo {
  title: string;
  order: number;
  description?: string;
  status: RomanzoStatus;
}

export type CommentAuthorType = "user" | "ai-mentor";

export interface ChapterComment {
  id: string;
  highlightId: string;
  author: string;
  authorType: CommentAuthorType;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export type SceneStatus = "bozza" | "revisione" | "finale";

export interface Scene {
  id: string;
  title: string;
  chapterFile?: string;
  pov?: string;
  luogo?: string;
  tempo?: string;
  personaggi: string[];
  obiettivo?: string;
  conflitto?: string;
  esito?: string;
  highlightId?: string;
  order: number;
  status: SceneStatus;
}

export type CharacterRole = "protagonista" | "antagonista" | "comprimario" | "altro";

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  description?: string;
  personality?: string;
  backstory?: string;
  goal?: string;
  arc?: string;
  relationships?: string;
  order: number;
}
