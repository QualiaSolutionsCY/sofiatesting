/**
 * Seed the 14 monthly recurring invoices into the invoice Supabase project
 * (`tijadsdysuxkxrpdlecq`). Idempotent: upserts on `external_id`, so re-running
 * updates the same 14 rows instead of duplicating. Adds alongside whatever
 * recurring invoices already exist — it never deletes.
 *
 * Usage:
 *   # dry run — prints what would be written, touches nothing
 *   pnpm exec tsx scripts/seed-recurring-invoices.ts --dry-run
 *
 *   # live — writes to the invoice DB (needs INVOICE_SUPABASE_URL +
 *   # INVOICE_SUPABASE_SERVICE_ROLE; pull them with `vercel env pull`)
 *   pnpm exec tsx scripts/seed-recurring-invoices.ts
 *
 * Env is read from process.env, falling back to .env.invoice.local then
 * .env.local.
 */
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

for (const file of [".env.invoice.local", ".env.local"]) {
  if (existsSync(file)) loadEnv({ path: file, override: false });
}

import { createClient } from "@supabase/supabase-js";
import {
  buildRecurringMonthlyInvoice,
  recurringMonthlyMetadata,
  RECURRING_MONTHLY_SOURCES,
} from "@/lib/invoices/data/recurring-monthly-invoices";
import { toDocumentRow } from "@/lib/invoices/supabase/document-mappers";
import { SUPABASE_TABLES } from "@/lib/invoices/supabase/schema";

const DRY_RUN = process.argv.includes("--dry-run");
const eur = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(n);

const payloads = RECURRING_MONTHLY_SOURCES.map((source) => {
  const doc = buildRecurringMonthlyInvoice(source);
  const row = toDocumentRow(doc);
  return {
    ...row,
    metadata: { ...row.metadata, ...recurringMonthlyMetadata(source) },
  };
});

console.log(`\n  14 monthly recurring invoices — ${SUPABASE_TABLES.documents}`);
console.log("  " + "─".repeat(78));
for (const p of payloads) {
  const vat =
    p.vat_mode === "plus-vat"
      ? `+VAT ${eur(p.vat_amount)}`
      : p.vat_mode === "included-vat"
        ? "VAT incl."
        : "no VAT";
  console.log(
    `  ${p.external_id}  ${p.client_name.padEnd(38).slice(0, 38)}  ${eur(
      p.total
    ).padStart(10)}  ${vat.padEnd(14)}  ${p.client_email ?? ""}`
  );
}
console.log("  " + "─".repeat(78));

const url = process.env.INVOICE_SUPABASE_URL;
const serviceRole = process.env.INVOICE_SUPABASE_SERVICE_ROLE;

if (DRY_RUN) {
  console.log("\n  --dry-run: nothing written.\n");
  process.exit(0);
}

if (!(url && serviceRole)) {
  console.error(
    "\n  ✗ Missing INVOICE_SUPABASE_URL / INVOICE_SUPABASE_SERVICE_ROLE.\n" +
      "    Pull prod env first:  vercel env pull .env.invoice.local\n"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function countMonthly(): Promise<number> {
  const { count, error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .select("*", { count: "exact", head: true })
    .eq("recurrence", "monthly");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main() {
  const before = await countMonthly();

  const { error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .upsert(payloads, { onConflict: "external_id" });
  if (error) {
    console.error(`\n  ✗ Upsert failed: ${error.message}\n`);
    process.exit(1);
  }

  const after = await countMonthly();
  console.log(
    `\n  ✓ Upserted ${payloads.length} rows. ` +
      `Monthly recurring invoices in DB: ${before} → ${after}.\n`
  );

  // Read back exactly the 14 we seeded, to confirm persistence.
  const ids = payloads.map((p) => p.external_id);
  const { data, error: readError } = await supabase
    .from(SUPABASE_TABLES.documents)
    .select("external_id, client_name, total, recurrence, client_email")
    .in("external_id", ids)
    .order("external_id");
  if (readError) {
    console.error(`  ✗ Read-back failed: ${readError.message}\n`);
    process.exit(1);
  }
  console.log(`  Verified ${data?.length ?? 0}/14 rows present in the DB.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
