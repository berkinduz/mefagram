import { createServer } from "node:http";

export async function serve(handler: (request: Request) => Promise<Response>) {
  const server = createServer(async (request, response) => {
    try {
      const url = `http://${request.headers.host}${request.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value))
          value.forEach((item) => headers.append(key, item));
        else if (value) headers.set(key, value);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const result = await handler(
        new Request(url, {
          method: request.method,
          headers,
          ...(body.length ? { body } : {}),
        }),
      );
      response.statusCode = result.status;
      result.headers.forEach((value, key) => response.setHeader(key, value));
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader("set-cookie", cookies);
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      console.error(error);
      response.statusCode = 500;
      response.end("Test server error");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not open a TCP port.");
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
