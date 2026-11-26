import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import WorldView, { type WorldViewName } from "@/components/sheets/WorldView";
import { isValidRepoRef, parseMapPath } from "@/lib/project/paths";

const VIEWS: WorldViewName[] = ["voci", "mappe", "storia", "regole"];

export default async function WorldPage({ params, searchParams }: PageProps<"/progetto/[owner]/[repo]/mondo">) {
  const { owner, repo } = await params;
  if (!isValidRepoRef(owner, repo)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/");
  const sp = await searchParams;
  const vista = typeof sp.vista === "string" && VIEWS.includes(sp.vista as WorldViewName) ? (sp.vista as WorldViewName) : "voci";
  const mappa = typeof sp.mappa === "string" && parseMapPath(sp.mappa) ? sp.mappa : null;
  return <WorldView owner={owner} repo={repo} initialView={mappa ? "mappe" : vista} initialMap={mappa} />;
}
