import { resolve } from 'node:path';
import { diagramMigration } from './migrate';

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
    // DDL contains no user input. Queries at the service boundary are parameterized.
    for (const statement of diagramMigration.split(';').filter(value => value.trim())) await database.query(statement);
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
