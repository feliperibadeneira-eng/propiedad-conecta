import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/services/admin";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";
import { ADMIN_NAV_LINKS } from "../nav";
import { toggleUserActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: "BUYER" | "AGENT" | "ADMIN" }>;
}) {
  const user = await requireAdmin();
  const { role } = await searchParams;
  const users = await listUsers(role);

  return (
    <>
      <DashboardHeader userName={user.name} links={ADMIN_NAV_LINKS} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
        <div className="mt-4 flex gap-2 text-sm">
          {(["BUYER", "AGENT", "ADMIN"] as const).map((r) => (
            <Link key={r} href={`?role=${r}`} className={buttonClasses(role === r ? "primary" : "secondary", "sm")}>
              {r}
            </Link>
          ))}
          <Link href="/admin/usuarios" className={buttonClasses(!role ? "primary" : "secondary", "sm")}>
            Todos
          </Link>
        </div>

        <div className="mt-5 space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {u.name} <span className="text-xs text-muted-2">({u.role})</span>
                </p>
                <p className="text-sm text-muted">
                  {u.email} · Registrado {formatDate(u.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={u.active ? "success" : "danger"}>
                  {u.active ? "Activo" : "Bloqueado"}
                </Badge>
                <form action={toggleUserActiveAction.bind(null, u.id, !u.active)}>
                  <button type="submit" className={buttonClasses("secondary", "sm")}>
                    {u.active ? "Bloquear" : "Activar"}
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
