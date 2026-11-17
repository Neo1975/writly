import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import WorldView from "@/components/sheets/WorldView";
import { isValidRepoRef } from "@/lib/project/paths";

export default async function WorldPage({ params }: PageProps<"/progetto/[owner]/[repo]/mondo">) {
  const { owner, repo } = await params;
  if (!isValidRepoRef(owner, repo)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  return <WorldView owner={owner} repo={repo} />;
}
