import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function clearHistory(userId, name) {
  console.log(`Clearing history for ${name} (ID: ${userId})`);

  const memoryRes = await sql`
      DELETE FROM public.sophia_conversation_memory 
      WHERE user_id = ${userId};
    `;
  console.log(`Deleted ${memoryRes.count} memory records.`);

  await sql`
      UPDATE public.sophia_user_profiles
      SET total_messages = 0, metadata = '{}', first_contact = CURRENT_TIMESTAMP, last_contact = CURRENT_TIMESTAMP
      WHERE id = ${userId};
    `;
  console.log(`Reset ${name} user stats.`);
}

async function run() {
  try {
    await clearHistory("de862d93-92a9-47e5-bd02-674719423261", "Marios Azinas");
    await clearHistory(
      "d3ef2255-2f5a-405a-8939-95ac395dd539",
      "Marios Polyviou"
    );
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

run();
