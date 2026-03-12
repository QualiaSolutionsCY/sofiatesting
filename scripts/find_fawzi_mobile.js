import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function findFawziAgent() {
  try {
    const agents = await sql`
      SELECT full_name, mobile FROM public.agents 
      WHERE full_name ILIKE '%fawzi%';
    `;
    console.log(JSON.stringify(agents, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

findFawziAgent();
