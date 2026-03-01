#!/usr/bin/env tsx

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function verifyUUIDs() {
  console.log("🔍 Verifying Zyprus User UUID Resolution\n");

  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }

  const client = postgres(process.env.POSTGRES_URL);

  try {
    // Query agents who can upload (need UUIDs for listing ownership)
    console.log("📊 Agents with can_upload=true - UUID status:\n");
    const agents = await client`
      SELECT
        full_name,
        communication_email,
        listing_owner_email,
        zyprus_user_id,
        can_upload,
        region
      FROM agents
      WHERE can_upload = true
      ORDER BY region, full_name
    `;

    console.table(agents);

    // Count missing UUIDs
    const missingUUIDs = agents.filter((a: any) => !a.zyprus_user_id);

    console.log("\n📊 Summary:");
    console.log(`   Total agents with can_upload=true: ${agents.length}`);
    console.log(
      `   Agents with zyprus_user_id: ${agents.length - missingUUIDs.length}`
    );
    console.log(`   Agents missing zyprus_user_id: ${missingUUIDs.length}`);

    if (missingUUIDs.length > 0) {
      console.log("\n⚠️  Agents missing UUIDs:");
      for (const agent of missingUUIDs) {
        console.log(`   - ${agent.full_name} (${agent.communication_email})`);
      }
      console.log(
        "\n💡 These agents will need fallback UUIDs in taxonomy-cache.ts USER_FALLBACKS map"
      );
    } else {
      console.log("\n✅ All agents with can_upload=true have zyprus_user_id");
    }

    await client.end();
  } catch (error) {
    console.error("❌ Error verifying UUIDs:", error);
    await client.end();
    process.exit(1);
  }
}

verifyUUIDs().catch(console.error);
