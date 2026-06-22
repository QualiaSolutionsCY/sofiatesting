/**
 * Sophia Invoice — authorized agents.
 *
 * Only these WhatsApp senders may drive invoicing through Sophia.
 * Matched on normalized MSISDN (digits only), comparing the last 8 digits
 * to tolerate +357 / 00357 / bare-digit and WhatsApp JID formats.
 *
 * Source: agents table (Supabase vceeheaxcrhmpqueudqx), `mobile` column.
 */
export const INVOICE_AUTHORIZED_AGENTS: ReadonlyArray<{ name: string; msisdn: string }> = [
  { name: "Fawzi Goussous", msisdn: "35799111668" },
  { name: "Charalambos Pitros", msisdn: "35799076732" },
  { name: "Marios Polyviou", msisdn: "35799921560" },
  { name: "Moayad Alqam", msisdn: "962799687499" },
];

export function normalizeMsisdn(input: string): string {
  return (input || "").replace(/\D/g, "");
}

export function isAuthorizedAgent(phone: string): boolean {
  const n = normalizeMsisdn(phone);
  if (n.length < 8) return false;
  const last8 = n.slice(-8);
  return INVOICE_AUTHORIZED_AGENTS.some((a) => a.msisdn.slice(-8) === last8);
}
