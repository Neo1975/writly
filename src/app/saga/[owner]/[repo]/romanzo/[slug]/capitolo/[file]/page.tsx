import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOctokit } from "@/lib/github";
import { listCapitoli } from "@/lib/domain";
import { Header } from "@/components/Header";
import { ChapterEditor } from "@/components/ChapterEditor";

export default async function CapitoloPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; slug: string; file: string }>;
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/");
  const { owner, repo, slug, file } = await params;
  const decodedFile = decodeURIComponent(file);

  const octokit = getOctokit(session.accessToken);
  const capitoli = await listCapitoli(octokit, owner, repo, slug);
  const title = capitoli.find((c) => c.file === decodedFile)?.title ?? decodedFile;

  return (
    <div className="flex flex-1 flex-col">
      <Header title={title} backHref={`/saga/${owner}/${repo}/romanzo/${slug}`} />
      <ChapterEditor
        owner={owner}
        repo={repo}
        romanzoSlug={slug}
        file={decodedFile}
        title={title}
      />
    </div>
  );
}
