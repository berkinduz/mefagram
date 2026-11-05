export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    mutationId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      cache: "no-store",
      signal: options.signal,
      headers: {
        ...(options.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(options.method && options.method !== "GET"
          ? { "idempotency-key": options.mutationId ?? crypto.randomUUID() }
          : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      "Could not connect. Your entries are preserved in this form; please try again.",
      "NETWORK_ERROR",
      0,
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      result.error ?? result.message ?? "Could not complete the request. Please try again.",
      result.code ?? "REQUEST_FAILED",
      response.status,
    );
  return result as T;
}
