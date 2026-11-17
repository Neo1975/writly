import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    GitHub({
      // "repo" serve per creare repository e scrivere i capitoli (anche privati).
      authorization: { params: { scope: "read:user repo" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (profile && "login" in profile && typeof profile.login === "string") token.login = profile.login;
      return token;
    },
    async session({ session, token }) {
      // Di proposito NON esponiamo accessToken: la sessione è leggibile dal browser.
      // Il token si legge solo lato server con getAccessToken() (src/lib/server/auth-token.ts).
      return { ...session, login: typeof token.login === "string" ? token.login : undefined };
    },
  },
});

declare module "next-auth" {
  interface Session {
    login?: string;
  }
}
