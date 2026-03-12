import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function searchFawzi() {
  try {
    const users = await sql`
      SELECT id, name FROM public.sophia_user_profiles;
    `;
    console.log(JSON.stringify(users, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

searchFawzi();
