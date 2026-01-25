#!/usr/bin/env tsx

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function queryAgents() {
  console.log("🔍 Verifying Listing Owner Email Mappings\n");

  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }

  const client = postgres(process.env.POSTGRES_URL);

  try {
    // Query agents with special listing owner emails or management roles
    console.log("📊 Agents with special listing owner mappings:\n");
    const agents = await client`
      SELECT
        full_name,
        communication_email,
        listing_owner_email,
        region,
        role,
        zyprus_user_id
      FROM agents
      WHERE role IN ('manager', 'management')
         OR (listing_owner_email IS NOT NULL AND listing_owner_email != communication_email)
      ORDER BY region, role
    `;

    console.table(agents);

    // Check specific mappings mentioned in spec
    console.log("\n✅ Expected Mappings Verification:\n");

    const expectedMappings = [
      { name: "Marios Azinas", email: "paphos@zyprus.com", expectedOwner: "azinas@zyprus.com" },
      { name: "Michelle", email: "limassol@zyprus.com", expectedOwner: "michelle@zyprus.com" },
      { name: "Lysandros", email: "larnaca@zyprus.com", expectedOwner: "requestlarnaca@zyprus.com" },
      { name: "Ivan", email: "nicosia@zyprus.com", expectedOwner: "requestnicosia@zyprus.com" },
      { name: "Narine", email: "famagusta@zyprus.com", expectedOwner: "requestfamagusta@zyprus.com" },
      { name: "Charalambos", email: "csc@zyprus.com", expectedOwner: "ASK" },
      { name: "Lauren", email: "listings@zyprus.com", expectedOwner: "ASK" },
    ];

    for (const expected of expectedMappings) {
      const agent = agents.find(
        (a: any) =>
          a.communication_email === expected.email ||
          a.full_name?.includes(expected.name)
      );
      if (agent) {
        const actualOwner = agent.listing_owner_email || agent.communication_email;
        const match = actualOwner === expected.expectedOwner;
        console.log(
          `${match ? "✅" : "❌"} ${expected.name}: ${actualOwner} ${match ? "" : `(expected: ${expected.expectedOwner})`}`
        );
      } else {
        console.log(`⚠️  ${expected.name}: NOT FOUND in database`);
      }
    }

    await client.end();
  } catch (error) {
    console.error("❌ Error querying agents:", error);
    await client.end();
    process.exit(1);
  }
}

queryAgents().catch(console.error);
