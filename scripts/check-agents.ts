import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Inline table definition for agents table (production schema uses snake_case)
const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  mobile: text("mobile"),
  communicationEmail: text("communication_email"),
  listingOwnerEmail: text("listing_owner_email"),
  region: text("region"),
  role: text("role"),
  canUpload: boolean("can_upload").default(true),
  telegramUserId: varchar("telegram_user_id", { length: 64 }),
  isActive: boolean("is_active").default(true),
  canReceiveLeads: boolean("can_receive_leads").default(true),
  zyprusUserId: uuid("zyprus_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

async function main() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("POSTGRES_URL or DATABASE_URL not set");
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  const agentsList = await db.select().from(agents);
  console.log("=== REGISTERED AGENTS ===");
  console.log("Total:", agentsList.length);
  console.log("");
  for (const agent of agentsList) {
    console.log("Name:", agent.fullName);
    console.log("  Communication Email:", agent.communicationEmail || "Not set");
    console.log("  Listing Owner Email:", agent.listingOwnerEmail || "Not set");
    console.log("  Mobile:", agent.mobile || "Not set");
    console.log("  Region:", agent.region || "Not set");
    console.log("  Role:", agent.role || "Not set");
    console.log("  Telegram ID:", agent.telegramUserId || "Not set");
    console.log("  Zyprus User ID:", agent.zyprusUserId || "Not set");
    console.log("  Active:", agent.isActive);
    console.log("  Can Receive Leads:", agent.canReceiveLeads);
    console.log("  Can Upload:", agent.canUpload);
    console.log("");
  }

  await client.end();
  process.exit(0);
}
main().catch(console.error);
