import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Writly",
  description: "Scrittura di racconti, romanzi e saghe, con le versioni su GitHub.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  return (
    <html lang="it">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Writly
          </Link>
          <span className="spacer" />
          {session?.user && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
              className="row"
            >
              <span className="small muted">{session.login ?? session.user.name}</span>
              <button type="submit" className="btn btn-small">
                Esci
              </button>
            </form>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
