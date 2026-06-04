import { AccessForm } from "./access-form";

export const dynamic = "force-dynamic";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scope = typeof sp.scope === "string" ? sp.scope : "admin";
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "";
  return <AccessForm scope={scope} callbackUrl={callbackUrl} />;
}
