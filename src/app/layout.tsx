import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import QuickCapture from "@/components/notes/QuickCapture";
import PwaSetup, { SignOutButton } from "@/components/ui/PwaSetup";
import SyncStatus from "@/components/ui/SyncStatus";
import "./globals.css";

export const metadata: Metadata = {
  title: "Writly",
  description: "Scrittura di racconti, romanzi e saghe, con le versioni su GitHub.",
  // iPad: aggiunta alla schermata Home, si apre a tutto schermo.
  appleWebApp: { capable: true, title: "Writly", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#f6f5f2" };

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  return (
    <html lang="it">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- piccolo SVG locale, niente da ottimizzare */}
            <img src="/icons/icon.svg" alt="" width={26} height={26} className="brand-mark" />
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
          {session?.user && <SyncStatus />}
          {session?.user && <QuickCapture />}
          {session?.user && (
            <>
              <span className="small muted">{session.login ?? session.user.name}</span>
              <SignOutButton signOutAction={signOutAction} />
            </>
          )}
        </header>
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
