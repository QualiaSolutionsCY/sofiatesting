import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("api:admin:agents");

/**
 * Transform a raw agents row from Supabase into the camelCase format
 * expected by the admin panel client components.
 */
const transformAgent = (a: Record<string, unknown>) => ({
  id: a.id,
  userId: a.user_id ?? null,
  fullName: a.full_name,
  email: (a.communication_email as string) || "",
  phoneNumber: a.mobile ?? null,
  region: a.region
    ? (a.region as string).charAt(0).toUpperCase() +
      (a.region as string).slice(1)
    : "Unknown",
  role: (a.role as string) || "agent",
  isActive: a.is_active ?? true,
  canReceiveLeads: a.can_receive_leads ?? true,
  telegramUserId: a.telegram_user_id?.toString() || null,
  whatsappPhoneNumber: a.whatsapp_phone_number ?? null,
  lastActiveAt: a.last_active_at ? new Date(a.last_active_at as string) : null,
  registeredAt: a.telegram_user_id ? new Date(a.created_at as string) : null,
  inviteSentAt: a.invite_sent_at ? new Date(a.invite_sent_at as string) : null,
  inviteToken: a.invite_token ?? null,
  notes: a.notes ?? null,
  createdAt: new Date(a.created_at as string),
  updatedAt: a.updated_at
    ? new Date(a.updated_at as string)
    : new Date(a.created_at as string),
});

/**
 * GET /api/admin/agents
 * List all agents with optional filtering and pagination
 *
 * Requires: Admin authentication (analyst or higher)
 *
 * Query parameters:
 * - region: Filter by region (Limassol, Paphos, etc.)
 * - role: Filter by role (CEO, Normal Agent, Manager, etc.)
 * - isActive: Filter by active status (true/false)
 * - search: Search by name or email
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 */
export async function GET(request: NextRequest) {
  // Check admin authentication
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get("region");
    const role = searchParams.get("role");
    const isActive = searchParams.get("isActive");
    const search = searchParams.get("search");
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;

    // Build query
    let query = getAdminSupabase()
      .from("agents")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (region) {
      query = query.eq("region", region.toLowerCase());
    }

    if (role) {
      query = query.eq("role", role);
    }

    if (isActive !== null && isActive !== undefined) {
      query = query.eq("is_active", isActive === "true");
    }

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,communication_email.ilike.%${search}%`
      );
    }

    const { data: agents, count, error } = await query;

    if (error) {
      logger.error("Error fetching agents", error);
      return NextResponse.json(
        { error: "Failed to fetch agents", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      agents: (agents || []).map(transformAgent),
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    logger.error("Error fetching agents", error);
    return NextResponse.json(
      {
        error: "Failed to fetch agents",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/agents
 * Create a new agent
 *
 * Requires: Admin authentication (admin or higher)
 *
 * Body:
 * {
 *   fullName: string
 *   email: string
 *   phoneNumber?: string
 *   region: string
 *   role: string
 *   isActive?: boolean
 *   notes?: string
 * }
 */
const createAgentSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(255),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Invalid email format",
    })
    .optional()
    .or(z.literal("")),
  phoneNumber: z.string().optional().or(z.literal("")),
  region: z
    .enum(["Paphos", "Limassol", "Larnaca", "Nicosia", "Famagusta", "All"])
    .optional()
    .default("All"),
  role: z.enum(["agent", "manager", "management"]).optional().default("agent"),
  isActive: z.boolean().optional().default(true),
  canUpload: z.boolean().optional().default(true),
  canReceiveLeads: z.boolean().optional().default(true),
  zyprusUserId: z.string().optional().or(z.literal("")),
  landline: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

/**
 * Build a synthetic email for agents created without one.
 * The DB requires NOT NULL on communication_email / listing_owner_email,
 * so we fall back to a deterministic placeholder derived from the name.
 */
function fallbackEmail(fullName: string): string {
  const slug =
    fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agent";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug}-${suffix}@pending.zyprus.local`;
}

/**
 * Normalize a Cyprus phone number to E.164.
 * Sophia identifies WhatsApp senders by matching the last 8 digits of
 * agents.mobile, so the canonical stored format is `+357XXXXXXXX`.
 * Returns the raw input if it doesn't look like a Cyprus mobile.
 */
function normalizeCyprusPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  let local = digits;
  if (local.startsWith("357")) local = local.slice(3);
  if (local.startsWith("0")) local = local.slice(1);
  if (local.length === 8) return `+357${local}`;
  return digits.startsWith("357") ? `+${digits}` : digits;
}

export async function POST(request: NextRequest) {
  // Check admin authentication - require admin role for creating agents
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  // Require at least admin role to create agents
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Validate request body with Zod schema
    const parseResult = createAgentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }
    const validatedData = parseResult.data;

    const email = validatedData.email?.trim()
      ? validatedData.email.trim()
      : fallbackEmail(validatedData.fullName);

    // Check if email already exists (only when caller supplied one)
    if (validatedData.email?.trim()) {
      const { data: existing } = await getAdminSupabase()
        .from("agents")
        .select("id")
        .eq("communication_email", email)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: "Agent with this email already exists" },
          { status: 409 }
        );
      }
    }

    // Normalize phone so Sophia's mobile-matching lookup (last-8-digit ILIKE
     // on agents.mobile) finds this agent the moment they message WhatsApp.
    const normalizedMobile = validatedData.phoneNumber
      ? normalizeCyprusPhone(validatedData.phoneNumber)
      : "";

    // Only accept a Zyprus user id that's a valid UUID — the column is typed
    // `uuid`, so any other value would 500 the insert.
    const zyprusUserId = validatedData.zyprusUserId?.trim() || "";
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validZyprusUserId = uuidRegex.test(zyprusUserId)
      ? zyprusUserId
      : null;

    // Create agent
    const insertPayload = {
      full_name: validatedData.fullName,
      communication_email: email,
      listing_owner_email: email,
      mobile: normalizedMobile,
      whatsapp_phone_number: normalizedMobile || null,
      region: (validatedData.region ?? "All").toLowerCase(),
      role: validatedData.role ?? "agent",
      is_active: validatedData.isActive ?? true,
      can_upload: validatedData.canUpload ?? true,
      can_receive_leads: validatedData.canReceiveLeads ?? true,
      zyprus_user_id: validZyprusUserId,
      landline: validatedData.landline?.trim() || null,
    };

    const { data: agent, error } = await getAdminSupabase()
      .from("agents")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error("Error creating agent", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        payload: insertPayload,
      });
      return NextResponse.json(
        {
          error: "Failed to create agent",
          details: error.message,
          code: error.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        agent: transformAgent(agent),
        message: "Agent created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Error creating agent", error);
    return NextResponse.json(
      {
        error: "Failed to create agent",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
