import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { createDatabase } from '../src/lib/db';
import { createAuth } from '../src/lib/auth/server';
import { PersonalTokenService } from '../src/lib/auth/tokens';
import { DiagramService } from '../src/lib/diagrams/service';
import { mefaAppsTemplate } from '../src/lib/diagrams/seed';

const testMode = process.argv.includes('--e2e');
const envFile = testMode ? '.mefagram/e2e.env' : '.env.local';
let existing: Record<string, string> = {};
try { existing = parse(await readFile(envFile)); } catch { /* A first install has no environment file. */ }
const config = {
  ...existing,
  BETTER_AUTH_URL: testMode ? 'http://127.0.0.1:3100' : existing.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3000',
  BETTER_AUTH_SECRET: existing.BETTER_AUTH_SECRET ?? randomBytes(40).toString('base64url'),
  MEFAGRAM_SETUP_KEY: existing.MEFAGRAM_SETUP_KEY ?? randomBytes(32).toString('hex'),
  MEFAGRAM_OWNER_EMAIL: testMode ? 'test@mefagram.local' : existing.MEFAGRAM_OWNER_EMAIL ?? process.env.MEFAGRAM_OWNER_EMAIL ?? 'berkin@mefagram.local',
  MEFAGRAM_DATA_DIR: testMode ? '.mefagram/e2e-db' : existing.MEFAGRAM_DATA_DIR ?? '.mefagram/db',
};
await mkdir('.mefagram', { recursive: true, mode: 0o700 });
await writeFile(envFile, Object.entries(config).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
const databaseUrl = testMode ? undefined : existing.DATABASE_URL ?? process.env.DATABASE_URL;
const db = await createDatabase({ dataDir: resolve(config.MEFAGRAM_DATA_DIR), databaseUrl });
try {
  const auth = createAuth(db, { baseURL: config.BETTER_AUTH_URL, secret: config.BETTER_AUTH_SECRET, setupKey: config.MEFAGRAM_SETUP_KEY, ownerEmail: config.MEFAGRAM_OWNER_EMAIL });
  const owners = await db.query('SELECT id, email FROM "user" LIMIT 1');
  const accessFile = testMode ? '.mefagram/e2e-access.json' : '.mefagram/local-access.json';
  let access: Record<string, string> = {};
  try { access = JSON.parse(await readFile(accessFile, 'utf8')); } catch { /* Credentials are generated once. */ }
  let ownerId: string;
  if (!owners.rows.length) {
    const password = randomBytes(24).toString('base64url');
    const user = await auth.api.signUpEmail({ body: { name: testMode ? 'Test alanı' : 'Berkin', email: config.MEFAGRAM_OWNER_EMAIL, password }, headers: new Headers({ 'x-mefagram-setup-key': config.MEFAGRAM_SETUP_KEY }) });
    ownerId = user.user.id;
    access = { email: config.MEFAGRAM_OWNER_EMAIL, password, baseURL: config.BETTER_AUTH_URL };
  } else {
    if (owners.rows[0].email !== config.MEFAGRAM_OWNER_EMAIL) throw new Error('This database already belongs to a different owner. Use its original owner configuration.');
    ownerId = owners.rows[0].id as string;
  }
  if (!access.agentToken) {
    const token = await new PersonalTokenService(db).create(ownerId, { name: testMode ? 'Test agent' : 'Bu bilgisayardaki agent', scopes: ['diagrams:read', 'diagrams:write'], expiresInDays: 90 });
    access.agentToken = token.token;
  }
  access.baseURL = config.BETTER_AUTH_URL;
  await writeFile(accessFile, JSON.stringify(access, null, 2) + '\n', { mode: 0o600 });
  const count = await db.query('SELECT id FROM diagrams WHERE owner_id = $1 LIMIT 1', [ownerId]);
  if (!count.rows.length) await new DiagramService(db, 'setup').create(ownerId, mefaAppsTemplate(), 'initial-mefa-apps-template-v1');
  console.log(`Mefagram ${testMode ? 'test' : db.mode} workspace ready. Credentials: ${accessFile}.`);
} finally { await db.close(); }

