import { getDatabase } from "@/lib/db";

export async function getRuntime() {
  return { database: await getDatabase() };
}
