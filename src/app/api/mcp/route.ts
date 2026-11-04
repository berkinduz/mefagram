import { createMcpEndpoint } from '@/lib/mcp/server';
import { getRuntime } from '@/lib/http/runtime';
import { errorResponse } from '@/lib/http/response';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
async function handle(request: Request) {
  try { return await createMcpEndpoint(await getRuntime())(request); }
  catch (error) { return errorResponse(error); }
}
export { handle as GET, handle as POST, handle as DELETE };

