import { redirect } from "next/navigation";

// Invoicing now lives at its own route, separate from the admin panel.
export default function LegacyInvoicesRedirect() {
  redirect("/invoices");
}
