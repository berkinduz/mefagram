// Mefagram runs without accounts, so the loopback boundary is the access
// control. Two browser attacks must still be refused:
// - DNS rebinding: a remote page resolves its own hostname to 127.0.0.1 and
//   reads the workspace. Its requests carry the attacker's Host header.
// - Cross-site requests: a remote page submits a form or `fetch` to
//   127.0.0.1. Browsers attach that page's Origin header.
// Local agents (Claude Code, the CLI) send a loopback Host and no Origin.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function loopbackHostname(value: string) {
  try {
    return LOOPBACK_HOSTS.has(new URL(`http://${value}`).hostname);
  } catch {
    return false;
  }
}

export function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Returns the reason a request must be refused, or null when it is local. */
export function rejectNonLocal(headers: Headers): string | null {
  const host = headers.get("host");
  if (!host || !loopbackHostname(host))
    return "Mefagram only accepts requests addressed to localhost.";
  const origin = headers.get("origin");
  if (origin !== null && !isLoopbackOrigin(origin))
    return "Requests from other websites are not allowed.";
  return null;
}

export function forbiddenResponse(reason: string) {
  return Response.json(
    { error: reason, code: "FORBIDDEN" },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
}
