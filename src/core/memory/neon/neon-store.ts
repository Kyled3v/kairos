import type { Memory, MemoryQuery, MemoryType, PersistentMemoryStore } from "../types.js";

// @neondatabase/serverless is an optional peer dependency.
// Install with: npm install @neondatabase/serverless
// Without it this store throws at runtime but does not break the build.

type NeonQueryResult = { rows: Record<string, unknown>[] };
type NeonSql = { (strings: TemplateStringsArray, ...values: unknown[]): Promise<NeonQueryResult> };

function getConnectionString(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL environment variable is required for NeonMemoryStore.");
  return url;
}

async function getSql(): Promise<NeonSql> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = (await import("@neondatabase/serverless" as string)) as { neon: (url: string) => NeonSql };
  return mod.neon(getConnectionString());
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row["id"] as string,
    type: row["type"] as MemoryType,
    content: row["content"] as string,
    importance: row["importance"] as number,
    createdAt: new Date(row["created_at"] as string),
    ...(row["last_accessed_at"] != null ? { lastAccessedAt: new Date(row["last_accessed_at"] as string) } : {}),
    metadata: (row["metadata"] as Record<string, unknown>) ?? {},
  };
}

export class NeonMemoryStore implements PersistentMemoryStore {
  private sql: NeonSql | undefined;

  async load(): Promise<void> { this.sql = await getSql(); }
  async flush(): Promise<void> { /* writes are immediate */ }

  private get db(): NeonSql {
    if (!this.sql) throw new Error("NeonMemoryStore not loaded — call load() first.");
    return this.sql;
  }

  async store(memory: Memory): Promise<Memory> {
    await this.db`INSERT INTO kairos_memories (id,type,content,importance,created_at,last_accessed_at,metadata) VALUES (${memory.id},${memory.type},${memory.content},${memory.importance},${memory.createdAt.toISOString()},${memory.lastAccessedAt?.toISOString()??null},${JSON.stringify(memory.metadata)}::jsonb) ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content,importance=EXCLUDED.importance,last_accessed_at=EXCLUDED.last_accessed_at,metadata=EXCLUDED.metadata`;
    return memory;
  }

  async retrieve(query: MemoryQuery): Promise<readonly Memory[]> {
    const t = query.type ?? null;
    const q = query.query;
    const lim = query.limit ?? 100;
    const like = q ? "%" + q + "%" : null;
    const r = await this.db`SELECT * FROM kairos_memories WHERE (${t}::text IS NULL OR type=${t}) AND (${like}::text IS NULL OR content ILIKE ${like}) ORDER BY importance DESC,created_at DESC LIMIT ${lim}`;
    return r.rows.map(rowToMemory);
  }

  async get(id: string): Promise<Memory | undefined> {
    const r = await this.db`SELECT * FROM kairos_memories WHERE id=${id}`;
    return r.rows[0] ? rowToMemory(r.rows[0]) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const r = await this.db`DELETE FROM kairos_memories WHERE id=${id} RETURNING id`;
    return r.rows.length > 0;
  }

  async clear(): Promise<void> { await this.db`DELETE FROM kairos_memories`; }

  async count(): Promise<number> {
    const r = await this.db`SELECT COUNT(*)::int AS n FROM kairos_memories`;
    return (r.rows[0]?.["n"] as number) ?? 0;
  }
}
