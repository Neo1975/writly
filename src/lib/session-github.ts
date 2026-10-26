import type { Octokit } from "octokit";
import { auth } from "@/auth";
import { getOctokit } from "./github";
import type { Session } from "next-auth";

export type SessionOctokit =
  | { ok: true; octokit: Octokit; session: Session }
  | { ok: false; status: number };

export async function requireSessionOctokit(): Promise<SessionOctokit> {
  const session = await auth();
  if (!session?.accessToken) {
    return { ok: false, status: 401 };
  }
  return { ok: true, octokit: getOctokit(session.accessToken), session };
}
