import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function fixMemories() {
  try {
    const res = await sql`
      UPDATE sophia_conversation_memory 
      SET content = REPLACE(content, '17,086', '30,000')
      WHERE content ILIKE '%17,086%';
    `;
    console.log(`Updated ${res.count} memory records.`);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

fixMemories();
