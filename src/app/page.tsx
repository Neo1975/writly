import { auth, signIn } from "@/auth";
import Library from "@/components/library/Library";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="page" style={{ maxWidth: 640 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 36, margin: "24px 0 8px" }}>
            Scrivi. Writly tiene il resto in ordine.
          </h1>
          <p className="muted" style={{ fontSize: 17, margin: 0 }}>
            Racconti, romanzi e saghe in un repository GitHub tuo: ogni capitolo è un file Markdown leggibile, ogni
            versione salvata è un commit.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn btn-primary">
            Accedi con GitHub
          </button>
        </form>
        <p className="hint">
          Writly chiede l&apos;accesso ai repository per creare i progetti e salvare le versioni. Il token resta sul
          server e non viene mai inviato al browser.
        </p>
      </main>
    );
  }

  return <Library />;
}
