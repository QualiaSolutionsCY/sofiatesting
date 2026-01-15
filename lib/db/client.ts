import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Skip database initialization during build time to allow static analysis
// When POSTGRES_URL is not set (build time), we return a stub
const hasDbConfig = !!process.env.POSTGRES_URL;

// Create lazy-initialized client
// biome-ignore lint: Forbidden non-null assertion.
const client = hasDbConfig
  ? postgres(process.env.POSTGRES_URL!, {
      // Connection settings optimized for Vercel serverless + Supabase pooler
      connect_timeout: 30, // 30 seconds connection timeout (increased for cold starts)
      idle_timeout: 0, // Disable idle timeout (let pooler manage)
      max: 1, // Single connection for serverless
      // Disable prepared statements for Supabase Transaction Pooler compatibility
      prepare: false,
      // SSL required for Supabase
      ssl: "require",
    })
  : (null as unknown as ReturnType<typeof postgres>);

export const db = hasDbConfig
  ? drizzle(client)
  : (null as unknown as ReturnType<typeof drizzle>);
