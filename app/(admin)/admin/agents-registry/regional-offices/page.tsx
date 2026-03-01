import "server-only";

import { Building2, MapPin, Mail, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("admin:regional-offices");

type RegionalOffice = {
  id: string;
  full_name: string;
  communication_email: string;
  region: string;
  zyprus_user_id: string | null;
  is_active: boolean;
};

// Known regional office emails from CLAUDE.md
const REGIONAL_OFFICE_EMAILS = [
  "requestpaphos@zyprus.com",
  "requestlimassol@zyprus.com",
  "requestlarnaca@zyprus.com",
  "requestnicosia@zyprus.com",
  "requestfamagusta@zyprus.com",
];

async function getRegionalOffices() {
  const supabase = getAdminSupabase();

  // Get agents that match regional office emails
  const { data: offices, error } = await supabase
    .from("agents")
    .select("*")
    .in("communication_email", REGIONAL_OFFICE_EMAILS);

  if (error) {
    logger.error("Error fetching regional offices", error);
    return [];
  }

  return offices as RegionalOffice[];
}

// Expected regional office data for display
const EXPECTED_OFFICES = [
  {
    region: "Paphos",
    email: "requestpaphos@zyprus.com",
    expectedUuid: "c8e05e2a-56e6-4d1f-9a20-31235feaec54",
    note: "Uses Azinas's UUID",
  },
  {
    region: "Limassol",
    email: "requestlimassol@zyprus.com",
    expectedUuid: "c82d28cd-8167-4a2a-9ae8-8168015869c3",
    note: "Username: limassol",
  },
  {
    region: "Larnaca",
    email: "requestlarnaca@zyprus.com",
    expectedUuid: "f889a6dc-0973-44b2-b10c-0d681f84f560",
    note: "Username: larnaca",
  },
  {
    region: "Nicosia",
    email: "requestnicosia@zyprus.com",
    expectedUuid: "630cc4fd-d2c7-410a-821d-b0a9adfae4ea",
    note: "Username: nicosia",
  },
  {
    region: "Famagusta",
    email: "requestfamagusta@zyprus.com",
    expectedUuid: "7e33cdcd-709d-4fc0-8682-0075dde55964",
    note: "Username: famagusta",
  },
];

export default async function RegionalOfficesPage() {
  const offices = await getRegionalOffices();

  // Create lookup map
  const officeMap = new Map(offices.map((o) => [o.communication_email, o]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Regional Offices</h1>
          <p className="text-muted-foreground">
            Manage regional office accounts used for Reviewer 2 assignments
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {EXPECTED_OFFICES.map((expected) => {
          const office = officeMap.get(expected.email);
          const hasZyprusId = !!office?.zyprus_user_id;
          const isConfigured = hasZyprusId && office.zyprus_user_id === expected.expectedUuid;

          return (
            <Card className="p-6" key={expected.region}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{expected.region}</h3>
                    <p className="text-muted-foreground text-sm">{expected.note}</p>
                  </div>
                </div>
                <Badge
                  variant={isConfigured ? "default" : hasZyprusId ? "secondary" : "destructive"}
                >
                  {isConfigured ? "Configured" : hasZyprusId ? "Mismatch" : "Missing"}
                </Badge>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{expected.email}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">
                    {office?.zyprus_user_id || "Not set"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Expected: <code className="font-mono text-xs">{expected.expectedUuid.slice(0, 8)}...</code>
                  </span>
                </div>
              </div>

              {!isConfigured && (
                <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-yellow-800 text-sm dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
                  {!office ? (
                    <p>No agent record found. Create one with email: {expected.email}</p>
                  ) : !hasZyprusId ? (
                    <p>Set zyprus_user_id to: {expected.expectedUuid}</p>
                  ) : (
                    <p>UUID mismatch. Expected: {expected.expectedUuid}</p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-6">
        <h3 className="font-semibold">How Regional Offices Work</h3>
        <div className="mt-4 space-y-2 text-muted-foreground text-sm">
          <p>
            Regional offices are used as <strong>Reviewer 2</strong> for FOR SALE listings.
            When an agent uploads a property:
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Reviewer 1 = Lauren (listings@zyprus.com) for most regions</li>
            <li>Reviewer 2 = Regional office for the property&apos;s location</li>
            <li>Exception: Famagusta - only requestfamagusta@zyprus.com (no Reviewer 2)</li>
          </ol>
          <p className="mt-3">
            The <code className="bg-muted px-1 py-0.5 rounded">zyprus_user_id</code> field links
            to the Zyprus platform user account for each regional office.
          </p>
        </div>
      </Card>
    </div>
  );
}
