import fs from "fs";
import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function getFuncDef() {
  const result = await sql`
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname IN ('search_sophia_knowledge', 'search_sophia_memory');
  `;

  const output = result.map((row) => row.pg_get_functiondef).join("\n\n");
  fs.writeFileSync("/tmp/functions.sql", output);
  console.log("Functions dumped to /tmp/functions.sql");
  process.exit(0);
}

getFuncDef().catch(console.error);
