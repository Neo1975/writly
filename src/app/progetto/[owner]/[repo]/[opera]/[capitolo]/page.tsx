import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import ChapterEditor from "@/components/editor/ChapterEditor";
import { isChapterFile, isSlug, isValidRepoRef } from "@/lib/project/paths";

export default async function ChapterPage({ params }: PageProps<"/progetto/[owner]/[repo]/[opera]/[capitolo]">) {
  const { owner, repo, opera, capitolo } = await params;
  const file = `${capitolo}.md`;
  if (!isValidRepoRef(owner, repo) || !isSlug(opera) || !isChapterFile(file)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  return <ChapterEditor owner={owner} repo={repo} work={opera} file={file} />;
}
