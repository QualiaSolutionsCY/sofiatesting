import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabaseUrl = "https://vceeheaxcrhmpqueudqx.supabase.co";
const supabaseKey = readFileSync(".env.local", "utf-8")
  .split("\n")
  .find((line) => line.startsWith("SUPABASE_SERVICE_ROLE_KEY"))
  ?.split("=")[1]
  ?.replace(/"/g, "")
  ?.trim();

if (!supabaseKey) {
  throw new Error("Could not find SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const templatesContent = readFileSync("/tmp/templates_content.txt", "utf-8");

async function main() {
  console.log("Task 1: Insert templates content into sophia_prompts table");

  const { data: existing, error: checkError } = await supabase
    .from("sophia_prompts")
    .select("key, priority, is_active")
    .eq("key", "templates")
    .maybeSingle();

  if (checkError) {
    console.error("Error checking:", checkError);
    throw checkError;
  }

  if (existing) {
    return;
  }

  const { data, error } = await supabase
    .from("sophia_prompts")
    .insert({
      key: "templates",
      content: templatesContent,
      category: "templates",
      description:
        "All 43 document templates for Cyprus real estate communications",
      priority: 80,
      is_active: true,
      updated_by: "migration-08-02",
      version: 1,
      is_current: true,
    })
    .select("key, priority, is_active, id")
    .single();

  if (error) {
    console.error("Error inserting:", error);
    throw error;
  }

  // Verify insertion
  const { data: verify, error: verifyError } = await supabase
    .from("sophia_prompts")
    .select("key, priority, is_active")
    .eq("key", "templates")
    .single();

  if (verifyError) {
    console.error("Verification failed:", verifyError);
    throw verifyError;
  }
}

main()
  .then(() => {
    console.log("✓ Templates migration complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n✗ Task 1 Failed:", err.message);
    process.exit(1);
  });
