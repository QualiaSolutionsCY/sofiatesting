import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function findMarios() {
  try {
    const mobile = "+35799616016"; // common Marios number? let me search by name first
    const agents = await sql`
      SELECT full_name, mobile FROM public.agents 
      WHERE full_name ILIKE '%marios%';
    `;
    console.log("Agents found:", JSON.stringify(agents, null, 2));

    for (const agent of agents) {
      const users = await sql`
        SELECT id, phone_number FROM public.sophia_user_profiles 
        WHERE phone_number LIKE ${"%" + agent.mobile.slice(-8) + "%"};
      `;
      console.log(
        `Profile for ${agent.full_name}:`,
        JSON.stringify(users, null, 2)
      );
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

findMarios();
