import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createLogger } from "@/lib/logger";
import { getZyprusLocations } from "@/lib/zyprus/client";

const logger = createLogger("api:listings:locations");

// Revalidate location data every hour (infrequently changing data)
export const revalidate = 3600;

export async function GET(_req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const locations = await getZyprusLocations();

    // Transform JSON:API response to simpler format
    const formattedLocations = locations.map((location: any) => ({
      id: location.id,
      name: location.attributes?.title || location.attributes?.name,
      type: location.attributes?.field_location_type,
      region: location.attributes?.field_region,
      district: location.attributes?.field_district,
    }));

    return NextResponse.json({
      success: true,
      locations: formattedLocations,
      count: formattedLocations.length,
    });
  } catch (error) {
    logger.error("Failed to get locations", error);
    return NextResponse.json(
      { error: "Failed to get locations from Zyprus" },
      { status: 500 }
    );
  }
}
