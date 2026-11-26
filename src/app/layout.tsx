import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import QuickCapture from "@/components/notes/QuickCapture";
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
          {session?.user && (
            <nav aria-label="Sezioni" className="topnav">
              <Link href="/">Libreria</Link>
              <Link href="/strutture">Strutture</Link>
              <Link href="/appunti">Appunti</Link>
            </nav>
          )}
          <span className="spacer" />
          {session?.user && <QuickCapture />}
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
