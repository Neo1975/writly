import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import ProjectView from "@/components/project/ProjectView";
import { isValidRepoRef } from "@/lib/project/paths";

export default async function ProjectPage({ params }: PageProps<"/progetto/[owner]/[repo]">) {
  const { owner, repo } = await params;
  if (!isValidRepoRef(owner, repo)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  return <ProjectView owner={owner} repo={repo} />;
}
