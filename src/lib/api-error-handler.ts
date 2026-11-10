import { NextResponse } from "next/server";
import { isUnauthorizedError } from "./github";

export function withGithubAuthHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return NextResponse.json({ error: "Token GitHub non valido" }, { status: 401 });
      }
      throw error;
    }
  };
}
