import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/Header";
import { SagaOverview } from "@/components/SagaOverview";

export default async function SagaPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const { owner, repo } = await params;

  return (
    <div className="flex flex-1 flex-col">
      <Header title={repo} backHref="/dashboard" />
      <SagaOverview owner={owner} repo={repo} />
    </div>
  );
}
