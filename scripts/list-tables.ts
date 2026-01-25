#!/usr/bin/env tsx

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function listTables() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }

  const client = postgres(process.env.POSTGRES_URL);

  try {
    const tables = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log("\n📋 Tables in database:\n");
    for (const table of tables) {
      console.log(`  - ${table.table_name}`);
    }

    await client.end();
  } catch (error) {
    console.error("❌ Error listing tables:", error);
    await client.end();
    process.exit(1);
  }
}

listTables().catch(console.error);
