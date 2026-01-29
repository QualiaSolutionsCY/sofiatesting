import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createLogger } from "@/lib/logger";
import { getZyprusTaxonomyTerms } from "@/lib/zyprus/client";

const logger = createLogger("api:listings:taxonomy");

export async function GET(req: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const vocabularyType = searchParams.get("type");

  if (!vocabularyType) {
    return NextResponse.json(
      { error: "Vocabulary type is required" },
      { status: 400 }
    );
  }

  // Valid vocabulary types for Zyprus
  const validTypes = [
    "indoor_property_views",
    "outdoor_property_features",
    "listing_type",
    "property_type",
    "price_modifier",
    "title_deed",
  ];

  if (!validTypes.includes(vocabularyType)) {
    return NextResponse.json(
      { error: "Invalid vocabulary type" },
      { status: 400 }
    );
  }

  try {
    const terms = await getZyprusTaxonomyTerms(vocabularyType);
    return NextResponse.json({ success: true, terms });
  } catch (error: unknown) {
    logger.error("Failed to fetch taxonomy terms", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to fetch taxonomy terms";
    const code =
      typeof (error as { code?: string })?.code === "string"
        ? (error as { code?: string }).code
        : "FETCH_ERROR";
    const statusCode =
      typeof (error as { statusCode?: number })?.statusCode === "number"
        ? (error as { statusCode?: number }).statusCode
        : 500;

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status: statusCode }
    );
  }
}
