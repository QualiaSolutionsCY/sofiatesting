import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { AdminHeader } from "@/components/admin/header";
import { AdminSidebar } from "@/components/admin/sidebar";
import { db } from "@/lib/db/client";
import { adminUserRole } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("admin:layout");

async function getAdminRole(email: string) {
  try {
    const adminRole = await db
      .select()
      .from(adminUserRole)
      .where(
        and(eq(adminUserRole.email, email), eq(adminUserRole.isActive, true))
      )
      .limit(1);

    return adminRole;
  } catch (error) {
    logger.error("Failed to fetch admin role", error);
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

  // Check if user has an explicit admin role (matched by email in admin_users table)
  const userEmail = session.user.email;
  if (!userEmail) {
    logger.error("No email in session", { userId: session.user.id });
    redirect("/");
  }

  logger.info("Admin access attempt", {
    email: userEmail,
    userId: session.user.id,
  });

  const adminRole = await getAdminRole(userEmail);

  if (adminRole.length === 0) {
    logger.warn("Unauthorized admin access attempt", {
      userId: session.user.id,
      email: userEmail,
      adminRoleExists: adminRole.length,
    });
    redirect("/login?error=AccessDenied");
  }

  const userRole = adminRole[0].role;
  const permissions = adminRole[0].permissions as Record<
    string,
    boolean
  > | null;

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar permissions={permissions} role={userRole} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader role={userRole} user={session.user} />
        <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
