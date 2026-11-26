import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import ChapterEditor from "@/components/editor/ChapterEditor";
import { VARIANT_PREFIX, isChapterFile, isSlug, isValidRepoRef, isVariantRef } from "@/lib/project/paths";

export default async function ChapterPage({ params, searchParams }: PageProps<"/progetto/[owner]/[repo]/[opera]/[capitolo]">) {
  const { owner, repo, opera, capitolo } = await params;
  const file = `${capitolo}.md`;
  if (!isValidRepoRef(owner, repo) || !isSlug(opera) || !isChapterFile(file)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  // ?variante=<nome>: si scrive sul ramo «variante/<nome>».
  const { variante } = await searchParams;
  const ramo = typeof variante === "string" ? `${VARIANT_PREFIX}${variante}` : null;
  if (ramo && !isVariantRef(ramo)) notFound();
  return <ChapterEditor key={ramo ?? "principale"} owner={owner} repo={repo} work={opera} file={file} variant={ramo} />;
}
