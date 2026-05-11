/**
 * Dump all property types from Zyprus API with parent/leaf structure
 * Run with: npx tsx scripts/dump-property-types.ts
 *
 * Purpose: Audit taxonomy to identify leaf UUIDs for PROPERTY_TYPE_FALLBACKS
 */

const ZYPRUS_API_URL = "https://dev9.zyprus.com";
const ZYPRUS_CLIENT_ID = "5Al3Dbs3X9Oqbi8PAjPh5wUfcfrothnub7gI8nOvLig";
const ZYPRUS_CLIENT_SECRET = 'M7wH"%zuyf8")KZ';

interface TaxonomyItem {
  id: string;
  name: string;
  parentId?: string;
}

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
    throw new Error(`Token fetch failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchPropertyTypes(token: string): Promise<TaxonomyItem[]> {
  const items: TaxonomyItem[] = [];
  let nextUrl: string | null = `${ZYPRUS_API_URL}/jsonapi/taxonomy_term/property_type?page[limit]=50`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch: ${response.status}`);
      break;
    }

    const data = await response.json();

    for (const item of data.data || []) {
      const rels = item.relationships as Record<string, { data?: Array<{ id: string }> | { id: string } | null }> | undefined;
      const parentData = rels?.parent?.data;
      const parentId = Array.isArray(parentData) ? parentData[0]?.id : undefined;

      items.push({
        id: item.id as string,
        name: (item.attributes?.name as string) || "",
        parentId,
      });
    }

    const next = data.links?.next;
    nextUrl = typeof next === "string" ? next : next?.href || null;
  }

  return items;
}

async function main() {
  console.log("Fetching Zyprus property type taxonomy...\n");

  const token = await getAccessToken();
  console.log("Authenticated successfully.\n");

  const allTypes = await fetchPropertyTypes(token);
  console.log(`Total property types: ${allTypes.length}\n`);

  // Identify parents (types that are referenced as parentId by others)
  const parentIds = new Set(allTypes.map((t) => t.parentId).filter(Boolean));

  // Identify leaves (types that are NOT parents of any other type)
  const leaves = allTypes.filter((t) => !parentIds.has(t.id));
  const parents = allTypes.filter((t) => parentIds.has(t.id));

  console.log("=== PARENT NODES (categories, NOT selectable as leaf radios) ===");
  for (const p of parents.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${p.name}: ${p.id}`);
  }

  console.log("\n=== LEAF NODES (selectable radios on the edit page) ===");
  for (const l of leaves.sort((a, b) => a.name.localeCompare(b.name))) {
    const parent = allTypes.find((t) => t.id === l.parentId);
    const parentLabel = parent ? ` (parent: ${parent.name})` : " (top-level leaf)";
    console.log(`  ${l.name}: ${l.id}${parentLabel}`);
  }

  console.log("\n=== FULL HIERARCHY ===");
  // Show tree
  const topLevel = allTypes.filter((t) => !t.parentId);
  for (const root of topLevel.sort((a, b) => a.name.localeCompare(b.name))) {
    const isParent = parentIds.has(root.id);
    const label = isParent ? "[PARENT]" : "[LEAF]";
    console.log(`${label} ${root.name}: ${root.id}`);
    // Show children
    const children = allTypes
      .filter((t) => t.parentId === root.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const childIsParent = parentIds.has(child.id);
      const childLabel = childIsParent ? "[PARENT]" : "[LEAF]";
      console.log(`  ${childLabel} ${child.name}: ${child.id}`);
      // Grandchildren
      const grandchildren = allTypes
        .filter((t) => t.parentId === child.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const gc of grandchildren) {
        console.log(`    [LEAF] ${gc.name}: ${gc.id}`);
      }
    }
  }

  // Generate suggested PROPERTY_TYPE_FALLBACKS
  console.log("\n=== SUGGESTED PROPERTY_TYPE_FALLBACKS (copy-paste ready) ===");
  console.log("export const PROPERTY_TYPE_FALLBACKS: Record<string, string> = {");
  for (const l of leaves.sort((a, b) => a.name.localeCompare(b.name))) {
    const key = l.name.toLowerCase();
    console.log(`  "${key}": "${l.id}",`);
  }
  console.log("};");
}

main().catch(console.error);
