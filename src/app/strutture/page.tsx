import { redirect } from "next/navigation";
import { auth } from "@/auth";
import StructureLibrary from "@/components/structures/StructureLibrary";

export const metadata = { title: "Strutture narrative · Writly" };

export default async function StructuresPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return <StructureLibrary />;
}
