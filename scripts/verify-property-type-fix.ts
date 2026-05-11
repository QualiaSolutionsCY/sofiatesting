/**
 * Verify property type leaf UUID fix
 * Creates test listings with specific property types and verifies the
 * Zyprus API accepted them with the correct leaf UUID.
 *
 * Run: npx tsx scripts/verify-property-type-fix.ts
 */

const ZYPRUS_API_URL = "https://dev9.zyprus.com";
const ZYPRUS_CLIENT_ID = "5Al3Dbs3X9Oqbi8PAjPh5wUfcfrothnub7gI8nOvLig";
const ZYPRUS_CLIENT_SECRET = 'M7wH"%zuyf8")KZ';

// Test cases: property types that were broken before the fix
const TEST_CASES = [
  {
    label: "apartment (should resolve to Flat leaf)",
    propertyTypeUuid: "47dba0ae-f01c-46ae-999e-5ccb48e53033",
    expectedLeafName: "Flat",
  },
  {
    label: "office (was missing from fallbacks)",
    propertyTypeUuid: "2528fe73-b53d-403f-b9b4-05f6efc2370b",
    expectedLeafName: "Office",
  },
  {
    label: "residential building (was removed, now restored)",
    propertyTypeUuid: "6c7500ba-2ffa-4d4e-88b8-b7f647bdce41",
    expectedLeafName: "Residential Building",
  },
];

async function getAccessToken(): Promise<string> {
  const response = await fetch(`${ZYPRUS_API_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SophiaAI",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ZYPRUS_CLIENT_ID,
      client_secret: ZYPRUS_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createMinimalListing(
  token: string,
  propertyTypeUuid: string,
  label: string
): Promise<string | null> {
  const payload = {
    data: {
      type: "node--property",
      attributes: {
        status: false,
        title: `[TEST] Property Type Fix Verification - ${label} - ${new Date().toISOString()}`,
        body: { value: "Automated test — verifying property type leaf UUID fix. Safe to delete.", format: "plain_text" },
        field_ai_state: "draft",
        field_price: "100000",
        field_no_bedrooms: 2,
        field_no_bathrooms: 1,
        field_covered_area: 80,
        field_new_build: false,
        field_ai_generated: true,
        field_map: {
          value: "POINT (33.3642 35.1856)",
          geo_type: "Point",
          lat: 35.1856,
          lon: 33.3642,
          latlon: "35.1856,33.3642",
        },
      },
      relationships: {
        field_property_type: {
          data: {
            type: "taxonomy_term--property_type",
            id: propertyTypeUuid,
          },
        },
        field_listing_type: {
          data: {
            type: "taxonomy_term--listing_type",
            id: "8f187816-a888-4cda-a937-1cee84b9c0ee",
          },
        },
        field_location: {
          data: {
            type: "node--location",
            id: "7dbc931e-90eb-4b89-9ac8-b5e593831cf8",
          },
        },
        field_price_modifier: {
          data: {
            type: "taxonomy_term--price_modifier",
            id: "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9",
          },
        },
        field_title_deed: {
          data: {
            type: "taxonomy_term--title_deed",
            id: "5c553db1-e53d-46a2-b609-093d17e75a7a",
          },
        },
      },
    },
  };

  const response = await fetch(`${ZYPRUS_API_URL}/jsonapi/node/property`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      "User-Agent": "SophiaAI",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`  FAILED to create listing for "${label}": ${response.status} ${text.substring(0, 200)}`);
    return null;
  }

  const data = await response.json();
  return data.data?.id || null;
}

async function verifyListing(
  token: string,
  nodeId: string,
  expectedLeafName: string
): Promise<boolean> {
  const response = await fetch(
    `${ZYPRUS_API_URL}/jsonapi/node/property/${nodeId}?include=field_property_type`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    }
  );

  if (!response.ok) {
    console.error(`  FAILED to fetch listing ${nodeId}: ${response.status}`);
    return false;
  }

  const data = await response.json();
  const included = data.included || [];
  const propertyType = included.find(
    (i: Record<string, unknown>) => (i.type as string) === "taxonomy_term--property_type"
  );

  if (!propertyType) {
    console.error("  No property_type relationship found in response");
    return false;
  }

  const attrs = propertyType.attributes as Record<string, string>;
  const actualName = attrs?.name || "(unknown)";
  const actualId = propertyType.id as string;

  if (actualName === expectedLeafName) {
    console.log(`  PASS: field_property_type = "${actualName}" (${actualId})`);
    return true;
  } else {
    console.error(
      `  FAIL: expected "${expectedLeafName}" but got "${actualName}" (${actualId})`
    );
    return false;
  }
}

async function deleteListing(token: string, nodeId: string): Promise<void> {
  await fetch(`${ZYPRUS_API_URL}/jsonapi/node/property/${nodeId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
      "User-Agent": "SophiaAI",
    },
  });
}

async function main() {
  console.log("=== Property Type Leaf UUID Verification ===\n");

  const token = await getAccessToken();
  console.log("Authenticated.\n");

  let allPassed = true;
  const createdIds: string[] = [];

  for (const tc of TEST_CASES) {
    console.log(`Testing: ${tc.label}`);
    console.log(`  UUID: ${tc.propertyTypeUuid}`);

    const nodeId = await createMinimalListing(token, tc.propertyTypeUuid, tc.label);
    if (!nodeId) {
      allPassed = false;
      continue;
    }
    createdIds.push(nodeId);

    console.log(`  Created node: ${nodeId}`);
    const passed = await verifyListing(token, nodeId, tc.expectedLeafName);
    if (!passed) allPassed = false;
    console.log();
  }

  // Cleanup
  console.log("Cleaning up test listings...");
  for (const id of createdIds) {
    await deleteListing(token, id);
    console.log(`  Deleted: ${id}`);
  }

  console.log(`\n=== Result: ${allPassed ? "ALL PASSED" : "SOME FAILED"} ===`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
