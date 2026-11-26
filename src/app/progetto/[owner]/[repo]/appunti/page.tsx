import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import NotesView from "@/components/notes/NotesView";
import { isValidRepoRef } from "@/lib/project/paths";

export default async function ProjectNotesPage({ params, searchParams }: PageProps<"/progetto/[owner]/[repo]/appunti">) {
  const { owner, repo } = await params;
  if (!isValidRepoRef(owner, repo)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  const { vista } = await searchParams;
  return <NotesView scope={{ kind: "progetto", owner, repo }} initialTab={vista === "glossario" ? "glossario" : "appunti"} />;
}
