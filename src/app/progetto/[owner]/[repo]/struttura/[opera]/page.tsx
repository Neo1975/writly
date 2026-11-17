import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import WorkStructureView from "@/components/structures/WorkStructureView";
import { isSlug, isValidRepoRef } from "@/lib/project/paths";

export default async function WorkStructurePage({ params }: PageProps<"/progetto/[owner]/[repo]/struttura/[opera]">) {
  const { owner, repo, opera } = await params;
  if (!isValidRepoRef(owner, repo) || !isSlug(opera)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  return <WorkStructureView owner={owner} repo={repo} work={opera} />;
}
