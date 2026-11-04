import { getAuth } from "@/lib/auth/server";
import { errorResponse } from "@/lib/http/response";

export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    return await (await getAuth()).handler(request);
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
