import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { getOctokit, getFile, isUnauthorizedError } from "@/lib/github";
import { Header } from "@/components/Header";
import { RomanzoOverview } from "@/components/RomanzoOverview";
import type { Romanzo } from "@/lib/types";

export default async function RomanzoPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; slug: string }>;
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/");
  const { owner, repo, slug } = await params;

  const octokit = getOctokit(session.accessToken);
  let romanzo: Romanzo | null = null;
  try {
    const file = await getFile(octokit, owner, repo, `romanzi/${slug}/romanzo.json`);
    romanzo = file ? (JSON.parse(file.content) as Romanzo) : null;
  } catch (error) {
    if (isUnauthorizedError(error)) {
      await signIn("github", { redirectTo: `/saga/${owner}/${repo}/romanzo/${slug}` });
    }
    throw error;
  }
  const title = romanzo?.title ?? slug;

  return (
    <div className="flex flex-1 flex-col">
      <Header title={title} backHref={`/saga/${owner}/${repo}`} />
      <RomanzoOverview owner={owner} repo={repo} slug={slug} title={title} />
    </div>
  );
}
