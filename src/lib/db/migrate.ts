export const diagramMigration = `
CREATE TABLE IF NOT EXISTS diagrams (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]',
  document JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS diagrams_owner_updated ON diagrams(owner_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS diagram_revisions (
  diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  content JSONB NOT NULL,
  actor TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (diagram_id, revision)
);
CREATE TABLE IF NOT EXISTS diagram_mutations (
  owner_id TEXT NOT NULL,
  mutation_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, mutation_key)
);
`;

export const LOCAL_OWNER = "local";

export const localOwnerMigration = `
UPDATE diagram_mutations m SET owner_id = '${LOCAL_OWNER}'
WHERE owner_id <> '${LOCAL_OWNER}' AND NOT EXISTS (
  SELECT 1 FROM diagram_mutations l
  WHERE l.owner_id = '${LOCAL_OWNER}' AND l.mutation_key = m.mutation_key
);
UPDATE diagrams SET owner_id = '${LOCAL_OWNER}' WHERE owner_id <> '${LOCAL_OWNER}';
DROP TABLE IF EXISTS personal_tokens;
`;
