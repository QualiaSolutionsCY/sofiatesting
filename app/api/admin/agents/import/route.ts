import { type NextRequest, NextResponse } from "next/server";
import { read, utils } from "xlsx";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";

const logger = createLogger("api:admin:agents:import");

type AgentRow = {
  "Fulla Name": string;
  "Mobile Phone": string | number;
  "Email use to communicate": string;
  Region: string;
  Role: string;
};

const normalizePhoneNumber = (phone: string | number): string => {
  if (typeof phone === "number") {
    const phoneStr = phone.toString();
    if (phoneStr.startsWith("357")) {
      return `+${phoneStr}`;
    }
    return `+357${phoneStr}`;
  }

  let cleaned = phone.trim();
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("357")) {
      cleaned = `+${cleaned}`;
    } else {
      cleaned = `+357${cleaned.replace(/\s+/g, "")}`;
    }
  }

  return cleaned;
};

const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

/**
 * POST /api/admin/agents/import
 * Bulk import agents from Excel file
 *
 * Body: FormData with 'file' field containing Excel file
 */
export async function POST(request: NextRequest) {
  // Check admin authentication
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  // Require admin role for bulk import
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls") &&
      !file.name.endsWith(".csv")
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file",
        },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = utils.sheet_to_json<AgentRow>(worksheet);

    if (rawData.length === 0) {
      return NextResponse.json(
        { error: "Excel file is empty" },
        { status: 400 }
      );
    }

    // Transform and validate data
    const agents = rawData
      .filter((row) => row["Fulla Name"] && row["Email use to communicate"])
      .map((row) => {
        const email = normalizeEmail(row["Email use to communicate"]);
        return {
          full_name: row["Fulla Name"].trim(),
          communication_email: email,
          listing_owner_email: email,
          mobile: row["Mobile Phone"]
            ? normalizePhoneNumber(row["Mobile Phone"])
            : "",
          region: row.Region.trim().toLowerCase(),
          role: row.Role.trim(),
          is_active: true,
        };
      });

    if (agents.length === 0) {
      return NextResponse.json(
        { error: "No valid agent data found in file" },
        { status: 400 }
      );
    }

    // Check for duplicate emails in the batch
    const emailSet = new Set<string>();
    const duplicatesInBatch: string[] = [];
    for (const agent of agents) {
      if (emailSet.has(agent.communication_email)) {
        duplicatesInBatch.push(agent.communication_email);
      } else {
        emailSet.add(agent.communication_email);
      }
    }

    if (duplicatesInBatch.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate emails found in file",
          duplicates: duplicatesInBatch,
        },
        { status: 400 }
      );
    }

    // Insert agents
    const { data: inserted, error } = await getAdminSupabase()
      .from("agents")
      .insert(agents)
      .select("id, communication_email");

    if (error) {
      if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
        return NextResponse.json(
          {
            error:
              "One or more agents already exist with the provided emails",
          },
          { status: 409 }
        );
      }
      logger.error("Error importing agents", error);
      return NextResponse.json(
        { error: "Failed to import agents", details: error.message },
        { status: 500 }
      );
    }

    // Regional breakdown
    const regionCounts = agents.reduce(
      (acc, agent) => {
        acc[agent.region] = (acc[agent.region] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Role breakdown
    const roleCounts = agents.reduce(
      (acc, agent) => {
        acc[agent.role] = (acc[agent.role] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json(
      {
        message: `Successfully imported ${(inserted || []).length} agents`,
        imported: (inserted || []).length,
        breakdown: {
          byRegion: regionCounts,
          byRole: roleCounts,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Error importing agents", error);
    return NextResponse.json(
      {
        error: "Failed to import agents",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
