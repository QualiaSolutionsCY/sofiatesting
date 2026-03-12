import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function clearFawziHistory() {
  try {
    // Find Fawzi's user ID
    const users = await sql`
      SELECT id FROM public.sophia_user_profiles 
      WHERE name ILIKE '%fawzi%';
    `;

    if (users.length === 0) {
      console.log("Fawzi not found in sophia_users");
      process.exit(0);
    }

    const userId = users[0].id;
    console.log(`Found Fawzi with user ID: ${userId}`);

    // Delete conversation memory
    const memoryRes = await sql`
      DELETE FROM public.sophia_conversation_memory 
      WHERE user_id = ${userId};
    `;
    console.log(`Deleted ${memoryRes.count} message(s) from memory.`);

    // Delete chat history table records just in case
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
