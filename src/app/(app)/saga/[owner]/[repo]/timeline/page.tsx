import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/Header";
import { TimelineBoard } from "@/components/TimelineBoard";

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const { owner, repo } = await params;

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Timeline degli eventi" backHref={`/saga/${owner}/${repo}`} />
      <TimelineBoard owner={owner} repo={repo} />
    </div>
  );
}
