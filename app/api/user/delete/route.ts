import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, signOut } from "@/app/(auth)/auth";
import { db } from "@/lib/db/client";
import { chat, landListing, propertyListing, user } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:user:delete");

const confirmationSchema = z.object({
  confirmDelete: z.literal(true, {
    errorMap: () => ({
      message: "To delete your account, you must send { confirmDelete: true }",
    }),
  }),
});

/**
 * DELETE /api/user/delete - Delete user and all associated data (GDPR Right to Erasure)
 *
 * This endpoint permanently deletes:
 * - User account
 * - All chats and messages (via CASCADE)
 * - All property and land listings
 * - All activity logs and summaries
 * - All document generation logs
 *
 * This action is IRREVERSIBLE.
 */
export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Require confirmation in request body
    const bodyParseResult = await request.json().catch(() => null);
    if (!bodyParseResult) {
      return NextResponse.json(
        { error: "Request body required" },
        { status: 400 }
      );
    }

    const parseResult = confirmationSchema.safeParse(bodyParseResult);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Confirmation required",
          message:
            "To delete your account, send { confirmDelete: true } in the request body",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    // Track what was deleted for audit purposes (before deletion)
    const deletionSummary = {
      userId,
      email: session.user.email,
      deletedAt: new Date().toISOString(),
      deletedData: {
        chats: 0,
        propertyListings: 0,
        landListings: 0,
      },
    };

    // Delete all user data in order (respecting foreign key constraints)
    // Note: Messages and Votes are deleted via CASCADE from Chat table

    // 1. Delete property listings (hard delete for GDPR compliance)
    const deletedPropertyListings = await db
      .delete(propertyListing)
      .where(eq(propertyListing.userId, userId))
      .returning({ id: propertyListing.id });
    deletionSummary.deletedData.propertyListings =
      deletedPropertyListings.length;

    // 2. Delete land listings (hard delete for GDPR compliance)
    const deletedLandListings = await db
      .delete(landListing)
      .where(eq(landListing.userId, userId))
      .returning({ id: landListing.id });
    deletionSummary.deletedData.landListings = deletedLandListings.length;

    // 3. Delete chats (messages and votes deleted via CASCADE)
    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning({ id: chat.id });
    deletionSummary.deletedData.chats = deletedChats.length;

    // 4. Finally, delete the user
    await db.delete(user).where(eq(user.id, userId));

    // Sign out the user
    try {
      await signOut({ redirect: false });
    } catch {
      // Ignore sign out errors, user data is already deleted
    }

    return NextResponse.json({
      success: true,
      message:
        "Your account and all associated data have been permanently deleted",
      summary: deletionSummary.deletedData,
    });
  } catch (error) {
    logger.error("GDPR Delete - Error deleting user data", error);
    return NextResponse.json(
      {
        error: "Failed to delete user data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/user/delete - Get information about what will be deleted
 *
 * Returns a summary of all data associated with the user's account.
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

    // Count all user data
    const [chatCount] = await db
      .select({ count: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    const [propertyCount] = await db
      .select({ count: propertyListing.id })
      .from(propertyListing)
      .where(eq(propertyListing.userId, userId));

    const [landCount] = await db
      .select({ count: landListing.id })
      .from(landListing)
      .where(eq(landListing.userId, userId));

    return NextResponse.json({
      user: {
        id: userId,
        email: session.user.email,
      },
      dataToBeDeleted: {
        chats: chatCount?.count || 0,
        propertyListings: propertyCount?.count || 0,
        landListings: landCount?.count || 0,
        description:
          "Deleting your account will permanently remove all chats, messages, property listings, land listings, and activity logs associated with your account.",
      },
      warning:
        "This action is IRREVERSIBLE. To proceed, send a DELETE request with { confirmDelete: true } in the body.",
    });
  } catch (error) {
    logger.error("GDPR Delete - Error getting user data summary", error);
    return NextResponse.json(
      { error: "Failed to get user data summary" },
      { status: 500 }
    );
  }
}
