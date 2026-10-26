import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <AppShell
      user={{
        name: session.user?.name ?? null,
        image: session.user?.image ?? null,
        login: session.login ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
