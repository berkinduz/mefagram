import { DiagramError } from '@/lib/diagrams/errors';

export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
}
export function errorResponse(error: unknown, headers: Record<string, string> = {}) {
  if (error instanceof DiagramError) return json({ error: error.message, code: error.code }, error.status, headers);
  console.error('Mefagram request failed:', error instanceof Error ? error.name : 'Unknown error');
  return json({ error: 'İşlem tamamlanamadı. Değişiklikleri koruyup yeniden deneyin.', code: 'INTERNAL_ERROR' }, 500, headers);
}
export async function readBody(request: Request, maximum = 2_100_000): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new DiagramError('VALIDATION_ERROR', 'İstek içeriği eksik.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new DiagramError('PAYLOAD_TOO_LARGE', 'İstek 2 MB sınırını aşıyor.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export async function readJson(request: Request): Promise<unknown> {
  const body = await readBody(request);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { throw new DiagramError('VALIDATION_ERROR', 'Geçerli bir JSON dosyası veya istek gönderin.'); }
}

