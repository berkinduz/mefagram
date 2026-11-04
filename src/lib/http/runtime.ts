import { getDatabase } from "@/lib/db";
import { getAuth } from "@/lib/auth/server";
import { authConfig } from "@/lib/auth/config";

export async function getRuntime() {
  const { baseURL } = authConfig();
  const [database, auth] = await Promise.all([getDatabase(), getAuth()]);
  return { database, auth, baseURL };
}
