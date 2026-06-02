import "./invoices.css";

import App from "@/components/invoices/redesign/App";
import { loadDocumentsAction } from "@/lib/invoices/actions/documents";
import { invoicesToDocs } from "@/lib/invoices/redesign/adapter";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const initialState = await loadDocumentsAction();
  const { docs, clients } = invoicesToDocs(initialState.documents);

  return (
    <App
      initialDocs={docs}
      initialClients={clients}
      persistenceMode={initialState.persistenceMode}
    />
  );
}
