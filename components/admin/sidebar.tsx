"use client";

import {
  Activity,
  Bot,
  Building2,
  DollarSign,
  FileEdit,
  FileText,
  LayoutDashboard,
  Menu,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
    name: "Listings",
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
    name: "Finance",
    href: "/admin/finance",
    icon: DollarSign,
    requiredPermission: "view_finance",
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
];

export function AdminSidebar({ role, permissions }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const hasPermission = (requiredPermission: string | null) => {
    if (!requiredPermission) return true;
    if (role === "superadmin") return true;
    return permissions?.[requiredPermission] === true;
  };

  const filteredNavigation = navigationItems.filter((item) =>
    hasPermission(item.requiredPermission)
  );

  const navContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link className="flex items-center gap-2 font-semibold" href="/admin">
          <Bot className="h-6 w-6" />
          <span>SOPHIA Admin</span>
        </Link>
        <Button
          className="md:hidden"
          onClick={() => setOpen(false)}
          size="icon"
          variant="ghost"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <nav className="space-y-1 p-4">
        {filteredNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
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
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <Button
        className="fixed top-3 left-3 z-50 md:hidden"
        onClick={() => setOpen(true)}
        size="icon"
        variant="outline"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform border-r bg-background transition-transform duration-200 ease-in-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 border-r bg-muted/40 md:block">
        {navContent}
      </aside>
    </>
  );
}
