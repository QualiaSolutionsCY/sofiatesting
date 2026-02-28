import { Building2, LayoutDashboard, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function PortalPage() {
  return (
    <div className="fade-in flex min-h-screen animate-in flex-col items-center justify-center bg-background p-4 duration-500">
      <div className="w-full max-w-4xl space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="font-bold text-4xl text-foreground tracking-tight lg:text-5xl">
            Qualia AI Agents Suite™
          </h1>
          <p className="text-muted-foreground text-xl">
            Select a module to continue
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Chat Module */}
          <Link
            className="group hover:-translate-y-1 relative flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
            href="/chat"
          >
            <div className="mb-4 rounded-full bg-primary/10 p-4 transition-colors group-hover:bg-primary/20">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 font-semibold text-xl">Chat with SOPHIA</h2>
            <p className="text-center text-muted-foreground text-sm">
              AI Assistant for Real Estate Services
            </p>
          </Link>

          {/* Admin Module */}
          <Link
            className="group hover:-translate-y-1 relative flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
            href="/admin"
          >
            <div className="mb-4 rounded-full bg-primary/10 p-4 transition-colors group-hover:bg-primary/20">
              <LayoutDashboard className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 font-semibold text-xl">Admin Dashboard</h2>
            <p className="text-center text-muted-foreground text-sm">
              System Management & Configuration
            </p>
          </Link>

          {/* Properties Module */}
          <Link
            className="group hover:-translate-y-1 relative flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
            href="/properties"
          >
            <div className="mb-4 rounded-full bg-primary/10 p-4 transition-colors group-hover:bg-primary/20">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 font-semibold text-xl">Properties</h2>
            <p className="text-center text-muted-foreground text-sm">
              Listing Management & Search
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
