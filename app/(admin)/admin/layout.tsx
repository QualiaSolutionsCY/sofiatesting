import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { AdminHeader } from "@/components/admin/header";
import { AdminSidebar } from "@/components/admin/sidebar";
import { db } from "@/lib/db/client";
import { adminUserRole } from "@/lib/db/schema";

async function getAdminRole(userId: string) {
  // Skip DB check if POSTGRES_URL is not configured (use Supabase client routes instead)
  if (!db) {
    console.warn("[Admin Layout] POSTGRES_URL not configured, granting default admin access");
    return [];
  }

  try {
    const adminRole = await db
      .select()
      .from(adminUserRole)
      .where(eq(adminUserRole.userId, userId))
      .limit(1);

    return adminRole;
  } catch (error) {
    console.error("[Admin Layout] Failed to fetch admin role:", error);
    // Return empty array to trigger default permissions
    return [];
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  // Check if user has admin role, otherwise grant default admin access
  const adminRole = await getAdminRole(session.user.id);

  // Grant all logged-in users admin access with default permissions
  const userRole = adminRole.length > 0 ? adminRole[0].role : "admin";
  const permissions =
    adminRole.length > 0
      ? (adminRole[0].permissions as Record<string, boolean> | null)
      : null; // Grant full access by default (null permissions = no restrictions)

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar permissions={permissions} role={userRole} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader role={userRole} user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
