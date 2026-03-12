import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function checkMemories() {
  try {
    const memoryRecords = await sql`
      SELECT id, role, content
      FROM sophia_conversation_memory 
      WHERE content ILIKE '%17,086%';
    `;

    console.log(`Found ${memoryRecords.length} records in memory with 17,086`);
    for (const m of memoryRecords) {
      console.log(
        `\n---\nRole: ${m.role}\nContent: ${m.content.substring(0, 100)}...`
      );
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

checkMemories();
