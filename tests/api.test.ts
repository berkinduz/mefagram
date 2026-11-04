import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '@/lib/db';
import { createAuth } from '@/lib/auth/server';
import { PersonalTokenService } from '@/lib/auth/tokens';
import { createApiHandler } from '@/lib/http/api';

describe('authenticated HTTP diagram workflow', () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  let handler: ReturnType<typeof createApiHandler>;
  let token: string;
  const baseURL = 'http://localhost:3200';
  const fixture = { title: 'Kalıcı API haritası', description: '', tags: [], document: { schemaVersion: 1, nodes: [{ id: 'first', label: 'İlk adım', kind: 'step' }], edges: [] } };
  const request = (path: string, method = 'GET', body?: unknown, key?: string, bearer = token) => handler(new Request(`${baseURL}${path}`, {
    method, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }));
  beforeAll(async () => {
    db = await createDatabase({ dataDir: 'memory://' });
    const setupKey = randomBytes(32).toString('hex');
    const auth = createAuth(db, { baseURL, setupKey, ownerEmail: 'api@mefagram.local', secret: randomBytes(40).toString('hex') });
    const owner = await auth.api.signUpEmail({ body: { email: 'api@mefagram.local', name: 'API Owner', password: randomBytes(24).toString('base64url') }, headers: new Headers({ 'x-mefagram-setup-key': setupKey }) });
    token = (await new PersonalTokenService(db).create(owner.user.id, { name: 'API test', scopes: ['diagrams:read', 'diagrams:write'], expiresInDays: 1 })).token;
    handler = createApiHandler({ database: db, auth, baseURL });
  });
  afterAll(async () => { await db?.close(); });

  test('rejects unauthenticated reads and writes without disclosing content', async () => {
    expect((await request('/api/diagrams', 'GET', undefined, undefined, '')).status).toBe(401);
    expect((await request('/api/diagrams', 'POST', fixture, 'unauth', '')).status).toBe(401);
  });

  test('creates, reopens, updates, exports, imports and archives a real record', async () => {
    const createdResponse = await request('/api/diagrams', 'POST', fixture, 'http-create');
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect((await (await request(`/api/diagrams/${created.id}`)).json()).title).toBe('Kalıcı API haritası');
    const updatedResponse = await request(`/api/diagrams/${created.id}`, 'PATCH', { expectedRevision: 1, operations: [{ op: 'update_node', id: 'first', changes: { notes: 'HTTP üzerinden kaydedildi' } }] }, 'http-update');
    expect(updatedResponse.status).toBe(200);
    expect((await updatedResponse.json()).revision).toBe(2);
    const stale = await request(`/api/diagrams/${created.id}`, 'PATCH', { expectedRevision: 1, operations: [{ op: 'update_metadata', changes: { title: 'Stale' } }] }, 'http-stale');
    expect(stale.status).toBe(409);
    const exported = await (await request(`/api/diagrams/${created.id}/export`)).json();
    const imported = await (await request('/api/diagrams/import', 'POST', exported, 'http-import')).json();
    expect(imported.document.nodes[0].notes).toBe('HTTP üzerinden kaydedildi');
    expect(imported.id).not.toBe(created.id);
    await request(`/api/diagrams/${created.id}`, 'PATCH', { expectedRevision: 2, operations: [{ op: 'update_metadata', changes: { archived: true } }] }, 'http-archive');
    expect((await (await request('/api/diagrams')).json()).map((item: { id: string }) => item.id)).not.toContain(created.id);
    expect((await (await request('/api/diagrams?archived=true')).json()).map((item: { id: string }) => item.id)).toContain(created.id);
  });

  test('requires idempotency keys and rejects malformed JSON without a server error', async () => {
    expect((await request('/api/diagrams', 'POST', fixture)).status).toBe(400);
    const response = await handler(new Request(`${baseURL}/api/diagrams`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': 'bad-json' }, body: '{' }));
    expect(response.status).toBe(400);
  });

  test('prevents an agent token from issuing more credentials', async () => {
    expect((await request('/api/tokens', 'GET')).status).toBe(403);
    expect((await request('/api/tokens', 'POST', { name: 'Escalate', scopes: ['diagrams:write'] }, 'escalation')).status).toBe(403);
  });
});
