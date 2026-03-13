"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import type { User } from "next-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AdminHeaderProps = {
  user: User;
  role: string;
};

export function AdminHeader({ user, role }: AdminHeaderProps) {
  const initials =
    user.email?.split("@")[0].substring(0, 2).toUpperCase() || "AD";

  const roleLabel = role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      {/* Left side — spacer for hamburger on mobile */}
      <div className="flex items-center gap-4">
        <div className="w-10 md:hidden" />
        <h2 className="font-medium text-muted-foreground text-sm">
          Role:{" "}
          <span className="font-semibold text-foreground">{roleLabel}</span>
        </h2>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="relative h-9 w-9 rounded-full" variant="ghost">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="font-medium text-sm leading-none">{user.email}</p>
                <p className="text-muted-foreground text-xs leading-none">
                  {roleLabel}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link className="cursor-pointer" href="/">
                <UserIcon className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link className="cursor-pointer" href="/api/auth/signout">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
