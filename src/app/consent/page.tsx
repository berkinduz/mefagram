import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";
import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value) query.set(key, value);
  }
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/sign-in?${query}`);
  const db = await getDatabase();
  const client = await db.query(
    "SELECT name FROM oauth_client WHERE client_id = $1",
    [query.get("client_id") ?? ""],
  );
  return (
    <ConsentForm
      clientName={String(client.rows[0]?.name ?? "Agent bağlantısı")}
      query={query.toString()}
    />
  );
}
