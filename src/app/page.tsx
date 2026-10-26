import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Writly</h1>
        <p className="mt-3 text-zinc-600">
          Scrivi le tue saghe, versionate su GitHub. Capitoli, evidenziazioni,
          commenti dell&apos;editor e architettura delle scene, tutto in un
          repository che puoi anche aprire con Claude Code.
        </p>
        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Accedi con GitHub
          </button>
        </form>
      </div>
    </main>
  );
}
