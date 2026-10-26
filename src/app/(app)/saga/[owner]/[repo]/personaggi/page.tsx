import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/Header";
import { CharacterBoard } from "@/components/CharacterBoard";

export default async function PersonaggiPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const { owner, repo } = await params;

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Schede personaggio" backHref={`/saga/${owner}/${repo}`} />
      <CharacterBoard owner={owner} repo={repo} />
    </div>
  );
}
