import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createPropertyListing } from "@/lib/db/queries";
import { createLogger } from "@/lib/logger";
import { generateUUID } from "@/lib/utils";

const logger = createLogger("api:listings:create");

const createListingSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  address: z.object({
    streetAddress: z.string().optional(),
    addressLocality: z.string(),
    postalCode: z.string().optional(),
    addressCountry: z.string().default("CY"),
  }),
  price: z
    .string()
    .or(z.number())
    .transform((val) => String(val)),
  currency: z.string().default("EUR"),
  numberOfRooms: z.number().min(0).max(50),
  numberOfBathroomsTotal: z
    .string()
    .or(z.number())
    .transform((val) => String(val)),
  floorSize: z
    .string()
    .or(z.number())
    .transform((val) => String(val)),
  propertyType: z.string().optional(),
  amenityFeature: z.array(z.string()).optional(),
  image: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validatedData = createListingSchema.parse(body);

    const listing = await createPropertyListing({
      id: generateUUID(),
      userId: session.user.id,
      name: validatedData.name,
      description: validatedData.description,
      address: validatedData.address,
      price: validatedData.price,
      currency: validatedData.currency,
      numberOfRooms: validatedData.numberOfRooms,
      numberOfBathroomsTotal: validatedData.numberOfBathroomsTotal,
      floorSize: validatedData.floorSize,
      propertyType: validatedData.propertyType,
      amenityFeature: validatedData.amenityFeature || [],
      image: validatedData.image || [],
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
      draftExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        name: listing.name,
        status: listing.status,
        createdAt: listing.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data format", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to create listing", error);
    return NextResponse.json(
      { error: "Failed to create listing" },
      { status: 500 }
    );
  }
}
