import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";
import { DiagramService } from "@/lib/diagrams/service";
import { DiagramError } from "@/lib/diagrams/errors";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ diagram?: string }>;
}) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const service = new DiagramService(await getDatabase());
  const diagrams = await service.list(session.user.id);
  const params = await searchParams;
  const id = params.diagram ?? diagrams[0]?.id;
  let record = null;
  if (id) {
    try {
      record = await service.get(session.user.id, id);
    } catch (error) {
      if (!(error instanceof DiagramError)) throw error;
    }
  }
  return (
    <Workspace
      initialDiagrams={diagrams}
      initialRecord={record}
      userName={session.user.name}
    />
  );
}
