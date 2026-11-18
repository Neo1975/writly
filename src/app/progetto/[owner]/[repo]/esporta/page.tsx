import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import ExportView from "@/components/export/ExportView";
import { isValidRepoRef } from "@/lib/project/paths";

export default async function ExportPage({ params }: PageProps<"/progetto/[owner]/[repo]/esporta">) {
  const { owner, repo } = await params;
  if (!isValidRepoRef(owner, repo)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  return <ExportView owner={owner} repo={repo} />;
}
