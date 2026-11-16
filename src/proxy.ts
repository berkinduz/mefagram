import type { NextRequest } from "next/server";
import { forbiddenResponse, rejectNonLocal } from "@/lib/http/local";

// Applies to every page, asset and API route: the workspace has no accounts,
// so only requests addressed to this computer may read or change it.
export function proxy(request: NextRequest) {
  const reason = rejectNonLocal(request.headers);
  if (reason) return forbiddenResponse(reason);
}
