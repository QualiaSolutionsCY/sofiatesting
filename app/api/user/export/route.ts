import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/lib/db/client";
import {
  chat,
  landListing,
  message,
  propertyListing,
  user,
} from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:user:export");

/**
 * GET /api/user/export - Export all user data (GDPR Right to Data Portability)
 *
 * Returns all user data in a machine-readable JSON format.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get user profile
    const [userProfile] = await db
      .select({
        id: user.id,
        email: user.email,
      })
      .from(user)
      .where(eq(user.id, userId));

    if (!userProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get all chats with messages (single JOIN query to avoid N+1 pattern)
    const chatsWithMessages = await db
      .select({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        visibility: chat.visibility,
        messages: sql<
          Array<{
            id: string;
            role: string;
            parts: unknown;
            createdAt: Date;
          }>
        >`
          COALESCE(
            json_agg(
              json_build_object(
                'id', ${message.id},
                'role', ${message.role},
                'parts', ${message.parts},
                'createdAt', ${message.createdAt}
              )
              ORDER BY ${message.createdAt}
            ) FILTER (WHERE ${message.id} IS NOT NULL),
            '[]'::json
          )
        `,
      })
      .from(chat)
      .leftJoin(message, eq(message.chatId, chat.id))
      .where(eq(chat.userId, userId))
      .groupBy(chat.id, chat.title, chat.createdAt, chat.visibility)
      .orderBy(desc(chat.createdAt));

    // Get property listings
    const propertyListings = await db
      .select({
        id: propertyListing.id,
        name: propertyListing.name,
        description: propertyListing.description,
        price: propertyListing.price,
        currency: propertyListing.currency,
        propertyType: propertyListing.propertyType,
        address: propertyListing.address,
        status: propertyListing.status,
        createdAt: propertyListing.createdAt,
        updatedAt: propertyListing.updatedAt,
      })
      .from(propertyListing)
      .where(eq(propertyListing.userId, userId))
      .orderBy(desc(propertyListing.createdAt));

    // Get land listings
    const landListings = await db
      .select({
        id: landListing.id,
        name: landListing.name,
        description: landListing.description,
        price: landListing.price,
        currency: landListing.currency,
        landTypeId: landListing.landTypeId,
        landSize: landListing.landSize,
        locationId: landListing.locationId,
        coordinates: landListing.coordinates,
        status: landListing.status,
        createdAt: landListing.createdAt,
        updatedAt: landListing.updatedAt,
      })
      .from(landListing)
      .where(eq(landListing.userId, userId))
      .orderBy(desc(landListing.createdAt));

    // Compile export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      dataSubject: {
        id: userProfile.id,
        email: userProfile.email,
      },
      data: {
        chats: chatsWithMessages,
        propertyListings,
        landListings,
      },
      summary: {
        totalChats: chatsWithMessages.length,
        totalMessages: chatsWithMessages.reduce(
          (acc, c) => acc + c.messages.length,
          0
        ),
        totalPropertyListings: propertyListings.length,
        totalLandListings: landListings.length,
      },
    };

    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="sofia-data-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    logger.error("GDPR Export - Error exporting user data", error);
    return NextResponse.json(
      {
        error: "Failed to export user data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
