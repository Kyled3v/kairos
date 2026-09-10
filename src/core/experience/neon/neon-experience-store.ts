import type { ExperienceRecord, ExperienceStore, ExperienceQuery, ExperienceOutcome } from "../record.js";

type NeonQueryResult = { rows: Record<string, unknown>[] };
type NeonSql = { (strings: TemplateStringsArray, ...values: unknown[]): Promise<NeonQueryResult> };

function getConnectionString(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL environment variable is required for NeonExperienceStore.");
  return url;
}

async function getSql(): Promise<NeonSql> {
  const mod = (await import("@neondatabase/serverless" as string)) as { neon: (url: string) => NeonSql };
  return mod.neon(getConnectionString());
}

function rowToRecord(row: Record<string, unknown>): ExperienceRecord {
  return {
    id: row["id"] as string,
    sessionId: row["session_id"] as string,
    goal: row["goal"] as string,
    totalCycles: row["total_cycles"] as number,
    outcome: row["outcome"] as ExperienceOutcome,
    toolCalls: (row["tool_calls"] as unknown[]) ?? [],
    errors: (row["errors"] as unknown[]) ?? [],
    startedAt: new Date(row["started_at"] as string),
    completedAt: new Date(row["completed_at"] as string),
    durationMs: row["duration_ms"] as number,
    metadata: (row["metadata"] as Record<string, unknown>) ?? {},
    ...(row["model_provider"] ? { modelProvider: row["model_provider"] as string } : {}),
    ...(row["model_id"] ? { modelId: row["model_id"] as string } : {}),
  } as ExperienceRecord;
}

export class NeonExperienceStore implements ExperienceStore {
  private sql: NeonSql | undefined;

  async load(): Promise<void> { this.sql = await getSql(); }

  private get db(): NeonSql {
    if (!this.sql) throw new Error("NeonExperienceStore not loaded — call load() first.");
    return this.sql;
  }

  async save(record: ExperienceRecord): Promise<ExperienceRecord> {
    await this.db`INSERT INTO kairos_experience (id,session_id,goal,total_cycles,outcome,model_provider,model_id,started_at,completed_at,duration_ms,tool_calls,errors,metadata) VALUES (${record.id},${record.sessionId},${record.goal},${record.totalCycles},${record.outcome},${record.modelProvider??null},${record.modelId??null},${record.startedAt.toISOString()},${record.completedAt.toISOString()},${record.durationMs},${JSON.stringify(record.toolCalls)}::jsonb,${JSON.stringify(record.errors)}::jsonb,${JSON.stringify(record.metadata)}::jsonb) ON CONFLICT (id) DO NOTHING`;
    return record;
  }

  async get(id: string): Promise<ExperienceRecord | undefined> {
    const r = await this.db`SELECT * FROM kairos_experience WHERE id=${id}`;
    return r.rows[0] ? rowToRecord(r.rows[0]) : undefined;
  }

  async query(filter: ExperienceQuery): Promise<readonly ExperienceRecord[]> {
    const outcome = filter.outcome ?? null;
    const sessionId = filter.sessionId ?? null;
    const modelProvider = filter.modelProvider ?? null;
    const goalLike = filter.goalContains ? "%" + filter.goalContains + "%" : null;
    const since = filter.since?.toISOString() ?? null;
    const lim = filter.limit ?? 100;
    const r = await this.db`SELECT * FROM kairos_experience WHERE (${outcome}::text IS NULL OR outcome=${outcome}) AND (${sessionId}::text IS NULL OR session_id=${sessionId}) AND (${modelProvider}::text IS NULL OR model_provider=${modelProvider}) AND (${goalLike}::text IS NULL OR goal ILIKE ${goalLike}) AND (${since}::timestamptz IS NULL OR started_at>=${since}::timestamptz) ORDER BY started_at DESC LIMIT ${lim}`;
    return r.rows.map(rowToRecord);
  }

  async count(): Promise<number> {
    const r = await this.db`SELECT COUNT(*)::int AS n FROM kairos_experience`;
    return (r.rows[0]?.["n"] as number) ?? 0;
  }

  async clear(): Promise<void> { await this.db`DELETE FROM kairos_experience`; }
}
