import fs from "fs";
import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function getPrompts() {
  try {
    const result =
      await sql`SELECT key, content FROM sophia_prompts WHERE key = 'cyprus_knowledge';`;
    if (result.length > 0) {
      fs.writeFileSync("/tmp/prompts.json", JSON.stringify(result, null, 2));
    } else {
      console.log("No prompt found");
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

getPrompts();
