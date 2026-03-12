import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function findCgt() {
  try {
    const memoryRecords = await sql`
      SELECT id, role
      FROM sophia_conversation_memory 
      WHERE content ILIKE '%17,086%';
    `;

    console.log(`Found ${memoryRecords.length} records in memory with 17,086`);

    const prompts = await sql`
      SELECT key 
      FROM sophia_prompts 
      WHERE content ILIKE '%17,086%';
    `;

    console.log(`\nFound ${prompts.length} records in prompts with 17,086`);
    for (const p of prompts) {
      console.log(`Key: ${p.key}`);
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

findCgt();
