import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.production.local" });

const applyMigration = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

  console.log("⏳ Applying password column expansion...");

  try {
    await sql`ALTER TABLE "User" ALTER COLUMN "password" TYPE varchar(255)`;
    console.log("✅ Password column expanded to varchar(255)");

    // Verify the change
    const result = await sql`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name='User' AND column_name='password'
    `;
    console.log("Verification:", result[0]);
  } catch (err: any) {
    if (err.code === '42P07' || err.message?.includes('already exists')) {
      console.log("⚠️  Column already expanded (migration already applied)");
    } else {
      throw err;
    }
  } finally {
    await sql.end();
  }
};

applyMigration().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
