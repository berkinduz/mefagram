import { resolve } from 'node:path';
import { diagramMigration } from './migrate';
import { authMigration } from './auth-migration';

export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends SqlExecutor {
  transaction<T>(operation: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  authDb: unknown;
  mode: 'local' | 'hosted';
}

export async function createDatabase(options: { dataDir?: string; databaseUrl?: string } = {}): Promise<Database> {
  let database: Database;
  if (options.databaseUrl) {
    const [{ Pool }, { drizzle }] = await Promise.all([import('pg'), import('drizzle-orm/node-postgres')]);
    const pool = new Pool({ connectionString: options.databaseUrl, max: 5, connectionTimeoutMillis: 10000 });
    database = {
      mode: 'hosted', authDb: drizzle(pool),
      query: (sql, parameters) => pool.query(sql, parameters),
      async transaction(operation) {
        const client = await pool.connect();
        try { await client.query('BEGIN'); const value = await operation(client); await client.query('COMMIT'); return value; }
        catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
      close: () => pool.end(),
    };
  } else {
    const [{ PGlite }, { drizzle }] = await Promise.all([import('@electric-sql/pglite'), import('drizzle-orm/pglite')]);
    const client = new PGlite(options.dataDir === 'memory://' ? undefined : resolve(options.dataDir ?? '.mefagram/db'));
    await client.waitReady;
    database = {
      mode: 'local', authDb: drizzle(client),
      query: (sql, parameters) => client.query(sql, parameters),
      transaction: operation => client.transaction(transaction => operation(transaction)),
      close: () => client.close(),
    };
  }
  try {
    await database.transaction(async transaction => {
      // Serialise cold-start migrations across hosted Function instances.
      if (database.mode === 'hosted') await transaction.query('SELECT pg_advisory_xact_lock(738401124)');
      await transaction.query('CREATE TABLE IF NOT EXISTS mefagram_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
      const applied = await transaction.query('SELECT id FROM mefagram_migrations');
      const ids = new Set(applied.rows.map(row => row.id));
      if (!ids.has('auth-v1')) {
        for (const statement of authMigration.split('--> statement-breakpoint').filter(value => value.trim())) await transaction.query(statement);
        await transaction.query('INSERT INTO mefagram_migrations (id) VALUES ($1)', ['auth-v1']);
      }
      if (!ids.has('diagrams-v1')) {
        for (const statement of diagramMigration.split(';').filter(value => value.trim())) await transaction.query(statement);
        await transaction.query('INSERT INTO mefagram_migrations (id) VALUES ($1)', ['diagrams-v1']);
      }
    });
  } catch (error) { await database.close(); throw error; }
  return database;
}

const globalDatabase = globalThis as typeof globalThis & { mefagramDatabase?: Promise<Database> };
export function getDatabase() {
  if (!globalDatabase.mefagramDatabase) {
    if (process.env.VERCEL && !process.env.DATABASE_URL) throw new Error('Hosted deployments require DATABASE_URL. Local database storage is disabled on Vercel.');
    globalDatabase.mefagramDatabase = createDatabase({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.MEFAGRAM_DATA_DIR });
    globalDatabase.mefagramDatabase.catch(() => { globalDatabase.mefagramDatabase = undefined; });
  }
  return globalDatabase.mefagramDatabase;
}
