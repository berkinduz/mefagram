import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '@/lib/db';
import { DiagramError } from '@/lib/diagrams/errors';
import { validated } from '@/lib/diagrams/schema';

export const tokenInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(['diagrams:read', 'diagrams:write'])).min(1).max(2),
  expiresInDays: z.number().int().min(1).max(90).default(30),
}).strict();
export type DiagramScope = 'diagrams:read' | 'diagrams:write';
export interface Identity { userId: string; actor: 'web' | 'mcp'; scopes: DiagramScope[] }
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export class PersonalTokenService {
  constructor(private readonly database: Database) {}
  async create(ownerId: string, input: unknown) {
    const parsed = validated(tokenInputSchema, input);
    const token = `mfg_${randomBytes(32).toString('base64url')}`;
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + parsed.expiresInDays * 86_400_000).toISOString();
    await this.database.query(`INSERT INTO personal_tokens (id, owner_id, name, token_hash, scopes, expires_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)`, [id, ownerId, parsed.name, digest(token), JSON.stringify([...new Set(parsed.scopes)]), expiresAt]);
    return { id, name: parsed.name, scopes: parsed.scopes, token, expiresAt };
  }
  async list(ownerId: string) {
    const result = await this.database.query(`SELECT id, name, scopes, expires_at, revoked_at, created_at FROM personal_tokens
      WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]);
    return result.rows.map(row => ({ id: row.id as string, name: row.name as string, scopes: row.scopes as DiagramScope[], expiresAt: new Date(row.expires_at as string).toISOString(), revoked: Boolean(row.revoked_at) }));
  }
  async verify(token: string): Promise<Identity | null> {
    if (!/^mfg_[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const result = await this.database.query(`SELECT t.owner_id, t.scopes FROM personal_tokens t JOIN "user" u ON u.id = t.owner_id
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > NOW()`, [digest(token)]);
    return result.rows[0] ? { userId: result.rows[0].owner_id as string, actor: 'mcp', scopes: result.rows[0].scopes as DiagramScope[] } : null;
  }
  async revoke(ownerId: string, id: string) {
    const result = await this.database.query('UPDATE personal_tokens SET revoked_at = NOW() WHERE owner_id = $1 AND id = $2 RETURNING id', [ownerId, id]);
    if (!result.rows.length) throw new DiagramError('NOT_FOUND', 'Erişim anahtarı bulunamadı.', 404);
  }
}

