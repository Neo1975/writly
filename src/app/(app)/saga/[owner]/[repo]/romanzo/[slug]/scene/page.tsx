import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/Header";
import { SceneBoard } from "@/components/SceneBoard";

export default async function ScenePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const { owner, repo, slug } = await params;

  return (
    <div className="flex flex-1 flex-col">
      <Header
        title="Architettura delle scene"
        backHref={`/saga/${owner}/${repo}/romanzo/${slug}`}
      />
      <SceneBoard owner={owner} repo={repo} slug={slug} />
    </div>
  );
}
