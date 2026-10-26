import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/Header";
import { Dashboard } from "@/components/Dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <Header title="Le tue saghe" />
      <Dashboard />
    </div>
  );
}
