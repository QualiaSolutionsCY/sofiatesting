"use client";

import {
  Activity,
  Bot,
  Building2,
  Calculator,
  Database,
  FileEdit,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type AdminSidebarProps = {
  role: string;
  permissions: Record<string, boolean> | null;
};

const navigationItems = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
    requiredPermission: null,
  },
  {
    name: "Live Activity",
    href: "/admin/activity",
    icon: Activity,
    requiredPermission: null,
  },
  {
    name: "Agents Registry",
    href: "/admin/agents-registry",
    icon: Users,
    requiredPermission: "manage_users",
  },
  {
    name: "Listings Review",
    href: "/admin/listings",
    icon: Building2,
    requiredPermission: null,
  },
  {
    name: "Prompts",
    href: "/admin/prompts",
    icon: FileEdit,
    requiredPermission: "manage_prompts",
  },
  {
    name: "Execution Logs",
    href: "/admin/logs",
    icon: FileText,
    requiredPermission: "view_agent_logs",
  },
  {
    name: "System Status",
    href: "/admin/status",
    icon: Activity,
    requiredPermission: "view_system_health",
  },
  {
    name: "Integrations",
    href: "/admin/integrations",
    icon: Database,
    requiredPermission: "manage_integrations",
  },
  {
    name: "Calculators",
    href: "/admin/calculators",
    icon: Calculator,
    requiredPermission: "manage_calculators",
  },
  {
    name: "Settings",
    href: "/admin/settings",
    icon: Settings,
    requiredPermission: "manage_settings",
  },
];

export function AdminSidebar({ role, permissions }: AdminSidebarProps) {
  const pathname = usePathname();

  const hasPermission = (requiredPermission: string | null) => {
    if (!requiredPermission) {
      return true;
    }
    if (role === "superadmin") {
      return true;
    }
    return permissions?.[requiredPermission] === true;
  };

  const filteredNavigation = navigationItems.filter((item) =>
    hasPermission(item.requiredPermission)
  );

  return (
    <aside className="w-64 border-r bg-muted/40">
      <div className="flex h-14 items-center border-b px-4">
        <Link className="flex items-center gap-2 font-semibold" href="/admin">
          <Bot className="h-6 w-6" />
          <span>SOFIA Admin</span>
        </Link>
      </div>
      <nav className="space-y-1 p-4">
        {filteredNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              href={item.href}
              key={item.href}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
