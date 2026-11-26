import { redirect } from "next/navigation";
import { auth } from "@/auth";
import NotesView from "@/components/notes/NotesView";

export const metadata = { title: "Appunti globali · Writly" };

export default async function LibraryNotesPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return <NotesView scope={{ kind: "libreria" }} />;
}
