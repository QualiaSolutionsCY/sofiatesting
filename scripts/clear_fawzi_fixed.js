import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function clearFawziHistory() {
  try {
    const userId = "88f9fbd9-c1ea-4dfa-a46f-28a24c029b61";
    console.log(`Clearing history for user ID: ${userId} (Fawzi)`);

    // Delete conversation memory
    const memoryRes = await sql`
      DELETE FROM public.sophia_conversation_memory 
      WHERE user_id = ${userId};
    `;
    console.log(`Deleted ${memoryRes.count} message(s) from memory.`);

    // Delete chat history table records
    const chatRes = await sql`
      DELETE FROM public.chat_history 
      WHERE user_id = ${userId};
    `;
    console.log(`Deleted ${chatRes.count} message(s) from chat_history.`);

    // Reset user profile stats
    await sql`
      UPDATE public.sophia_user_profiles
      SET total_messages = 0, metadata = '{}', first_contact = CURRENT_TIMESTAMP, last_contact = CURRENT_TIMESTAMP
      WHERE id = ${userId};
    `;
    console.log("Reset Fawzi user stats.");
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

clearFawziHistory();
