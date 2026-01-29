import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { zyprusAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:agents");

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

    // Build WHERE clause
    const conditions: SQL[] = [];

    if (region) {
      conditions.push(eq(zyprusAgent.region, region));
    }

    if (role) {
      conditions.push(eq(zyprusAgent.role, role));
    }

    if (isActive !== null) {
      conditions.push(eq(zyprusAgent.isActive, isActive === "true"));
    }

    if (search) {
      const searchCondition = or(
        ilike(zyprusAgent.fullName, `%${search}%`),
        ilike(zyprusAgent.email, `%${search}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Execute query with pagination
    const agents = await db
      .select()
      .from(zyprusAgent)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(zyprusAgent.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: db.$count(zyprusAgent) })
      .from(zyprusAgent)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({
      agents,
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
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

    // Validate required fields
    if (!body.fullName || !body.email || !body.region || !body.role) {
      return NextResponse.json(
        { error: "Missing required fields: fullName, email, region, role" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await db
      .select()
      .from(zyprusAgent)
      .where(eq(zyprusAgent.email, body.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Agent with this email already exists" },
        { status: 409 }
      );
    }

    // Generate invite token
    const inviteToken = randomBytes(32).toString("hex");

    // Create agent
    const [agent] = await db
      .insert(zyprusAgent)
      .values({
        fullName: body.fullName,
        email: body.email.toLowerCase(),
        phoneNumber: body.phoneNumber || null,
        region: body.region,
        role: body.role,
        isActive: body.isActive ?? true,
        notes: body.notes || null,
        inviteToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json(
      {
        agent,
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
