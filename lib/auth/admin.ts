import { and, eq } from "drizzle-orm";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/lib/db/client";
import { adminUserRole } from "@/lib/db/schema";

export type AdminRole = "superadmin" | "admin" | "support" | "analyst";

export type AdminCheckResult = {
  isAdmin: boolean;
  userId: string | null;
  role: AdminRole | null;
  error?: string;
};

/**
 * Check if the current user has admin privileges
 * Returns user info if admin, or error details if not
 *
 * Security: Only users with explicit active entries in admin_users table are granted access.
 * Matches by email. All other authenticated users are denied (fail-closed).
 */
export const checkAdminAuth = async (): Promise<AdminCheckResult> => {
  const session = await auth();

  if (!session?.user?.id || !session?.user?.email) {
    return {
      isAdmin: false,
      userId: null,
      role: null,
      error: "Authentication required",
    };
  }

  const userId = session.user.id;

  try {
    // Check if user has explicit admin role (matched by email in admin_users table)
    const adminRoles = await db
      .select()
      .from(adminUserRole)
      .where(and(eq(adminUserRole.email, session.user.email), eq(adminUserRole.isActive, true)))
      .limit(1);

    if (adminRoles.length > 0) {
      const [adminRecord] = adminRoles;
      return {
        isAdmin: true,
        userId,
        role: adminRecord.role as AdminRole,
      };
    }

    // Deny access if no explicit admin role exists
    return {
      isAdmin: false,
      userId,
      role: null,
      error: "User does not have admin privileges",
    };
  } catch (error) {
    console.error("[checkAdminAuth] Database error:", error);
    // On database error, deny access (fail-closed)
    return {
      isAdmin: false,
      userId,
      role: null,
      error: "Database error checking admin status",
    };
  }
};

/**
 * Check if admin has a specific permission level
 */
export const hasAdminPermission = (
  role: AdminRole | null,
  requiredRoles: AdminRole[]
): boolean => {
  if (!role) {
    return false;
  }
  return requiredRoles.includes(role);
};

/**
 * Permission hierarchy for admin roles
 * superadmin > admin > support > analyst
 */
export const ADMIN_ROLE_HIERARCHY: Record<AdminRole, number> = {
  superadmin: 4,
  admin: 3,
  support: 2,
  analyst: 1,
};

/**
 * Check if a role has at least the minimum required level
 */
export const hasMinimumRole = (
  role: AdminRole | null,
  minimumRole: AdminRole
): boolean => {
  if (!role) {
    return false;
  }
  return ADMIN_ROLE_HIERARCHY[role] >= ADMIN_ROLE_HIERARCHY[minimumRole];
};
