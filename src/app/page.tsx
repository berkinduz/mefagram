import { getDatabase } from "@/lib/db";
import { LOCAL_OWNER } from "@/lib/db/migrate";
import { DiagramService } from "@/lib/diagrams/service";
import { DiagramError } from "@/lib/diagrams/errors";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ diagram?: string; node?: string }>;
}) {
  const service = new DiagramService(await getDatabase());
  const diagrams = await service.list(LOCAL_OWNER);
  const params = await searchParams;
  const id = params.diagram ?? diagrams[0]?.id;
  let record = null;
  if (id) {
    try {
      record = await service.get(LOCAL_OWNER, id);
    } catch (error) {
      if (!(error instanceof DiagramError)) throw error;
    }
  }
  return (
    <Workspace
      initialDiagrams={diagrams}
      initialRecord={record}
      initialNodeId={params.node}
    />
  );
}
