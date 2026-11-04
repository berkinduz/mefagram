import { createApiHandler } from "@/lib/http/api";
import { getRuntime } from "@/lib/http/runtime";
import { errorResponse } from "@/lib/http/response";

export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    return await createApiHandler(await getRuntime())(request);
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
