import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function findCgt() {
  try {
    const records = await sql`
      SELECT id, title, content 
      FROM sophia_knowledge_base 
      WHERE content ILIKE '%17,086%';
    `;

    console.log(
      `Found ${records.length} records in knowledge base with 17,086`
    );
    for (const r of records) {
      console.log(`\nID: ${r.id}`);
      console.log(`Title: ${r.title}`);
    }

    const memoryRecords = await sql`
      SELECT id, role, content 
      FROM sophia_conversation_memory 
      WHERE content ILIKE '%17,086%';
    `;

    console.log(
      `\nFound ${memoryRecords.length} records in memory with 17,086`
    );

    // Let's also check all prompt keys just in case
    const prompts = await sql`
      SELECT key, title 
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
