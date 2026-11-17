import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import CharactersView from "@/components/sheets/CharactersView";
import { isValidRepoRef } from "@/lib/project/paths";

export default async function CharactersPage({ params }: PageProps<"/progetto/[owner]/[repo]/personaggi">) {
  const { owner, repo } = await params;
  if (!isValidRepoRef(owner, repo)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  return <CharactersView owner={owner} repo={repo} />;
}
