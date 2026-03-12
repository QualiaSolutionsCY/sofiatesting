import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.vceeheaxcrhmpqueudqx:Zambelis123%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
);

async function findFawziProfile() {
  try {
    const mobile = "+35799111668";
    // The phone_number might be without + or formatted differently, so let's check
    const users = await sql`
      SELECT id, phone_number, name FROM public.sophia_user_profiles 
      WHERE phone_number LIKE ${"%" + mobile.slice(-8) + "%"};
    `;
    console.log(JSON.stringify(users, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

findFawziProfile();
