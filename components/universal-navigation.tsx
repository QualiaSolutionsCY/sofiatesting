"use client";

import {
  Building2,
  Home,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UniversalNavigation() {

  // Don't show on the portal page itself if you want, but "Universal" implies everywhere.
  // It's useful even on the home page to see what's available or jump around.

  return (
    <div className="fixed top-4 right-4 z-[100]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="rounded-full border-muted-foreground/20 bg-background/80 shadow-md backdrop-blur-sm hover:bg-accent"
            size="icon"
            variant="outline"
          >
            <LayoutGrid className="h-5 w-5" />
            <span className="sr-only">Open Menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Navigation</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link className="flex cursor-pointer items-center" href="/">
              <Home className="mr-2 h-4 w-4" />
              <span>Portal Home</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link className="flex cursor-pointer items-center" href="/chat">
              <MessageSquare className="mr-2 h-4 w-4" />
              <span>Chat with SOPHIA</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link className="flex cursor-pointer items-center" href="/admin">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Admin Dashboard</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link
              className="flex cursor-pointer items-center"
              href="/properties"
            >
              <Building2 className="mr-2 h-4 w-4" />
              <span>Properties</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
