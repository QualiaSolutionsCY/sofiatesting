/**
 * Check edge function logs for My Notes verification
 * Uses Supabase JS client to query chat_history
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("🔍 Checking chat history for recent property uploads...\n");

  // Query chat_history for recent messages from Michelle's phone
  const { data, error } = await supabase
    .from("chat_history")
    .select("created_at, role, phone_number, message")
    .eq("phone_number", "35799458212")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error querying chat_history:", error);

    // Try a different approach - check if we can query any table
    console.log("\n📊 Checking database connectivity...");
    const { data: tables, error: tablesError } = await supabase
      .from("agents")
      .select("full_name, mobile")
      .limit(1);

    if (tablesError) {
      console.error("Cannot query agents table either:", tablesError);
    } else {
      console.log("Connected to database, agents table accessible");
      console.log("Sample:", tables);
    }
    return;
  }

  if (!data || data.length === 0) {
    console.log("No chat history found for phone 35799458212");
    return;
  }

  console.log(`Found ${data.length} messages:\n`);

  for (const row of data) {
    console.log("=".repeat(60));
    console.log(`Time: ${row.created_at}`);
    console.log(`Role: ${row.role}`);
    console.log(`Phone: ${row.phone_number}`);

    // Check if message contains myNotes or SOPHIA AI
    const msgStr =
      typeof row.message === "string"
        ? row.message
        : JSON.stringify(row.message);

    if (
      msgStr.toLowerCase().includes("my notes") ||
      msgStr.toLowerCase().includes("mynotes")
    ) {
      console.log("\n⚠️  Contains 'My Notes' reference");
    }

    if (msgStr.toLowerCase().includes("sophia ai")) {
      console.log("\n❌ FOUND 'SOPHIA AI' in message!");
      console.log("Message excerpt:", msgStr.substring(0, 500));
    } else {
      console.log("\n✅ No 'SOPHIA AI' found in this message");
    }

    // Show message preview
    console.log("\nMessage preview:", msgStr.substring(0, 300) + "...");
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    "📝 To see the actual My Notes field, check the draft on Zyprus:"
  );
  console.log("   https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
}

main().catch(console.error);
