import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import OverviewView from "@/components/project/OverviewView";
import { isValidRepoRef } from "@/lib/project/paths";

export default async function OverviewPage({ params }: PageProps<"/progetto/[owner]/[repo]/panoramica">) {
  const { owner, repo } = await params;
  if (!isValidRepoRef(owner, repo)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  return <OverviewView owner={owner} repo={repo} />;
}
