import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ExperienceRecord,
  ExperienceQuery,
  ExperienceStore,
  ToolCallRecord,
  ErrorRecord,
  ExperienceFeedback,
  ExperienceOutcome,
} from "../record.js";

export interface FileExperienceStoreOptions {
  readonly filePath: string;
}

export interface SkippedLine {
  readonly line: string;
  readonly reason: string;
}

function getString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string") throw new Error("Expected string at " + key + ", got " + typeof v);
  return v;
}

function getNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== "number") throw new Error("Expected number at " + key + ", got " + typeof v);
  return v;
}

function getDate(obj: Record<string, unknown>, key: string): Date {
  const v = obj[key];
  if (typeof v !== "string" && !(v instanceof Date)) {
    throw new Error("Expected date string at " + key + ", got " + typeof v);
  }
  return new Date(v as string);
}

function getBoolean(obj: Record<string, unknown>, key: string): boolean {
  const v = obj[key];
  if (typeof v !== "boolean") throw new Error("Expected boolean at " + key + ", got " + typeof v);
  return v;
}

function deserializeToolCall(tc: Record<string, unknown>): ToolCallRecord {
  const base: Record<string, unknown> = {
    toolId: getString(tc, "toolId"),
    requestId: getString(tc, "requestId"),
    parameters: (tc["parameters"] as Readonly<Record<string, unknown>>) ?? {},
    status: getString(tc, "status") as ToolCallRecord["status"],
    executedAt: getDate(tc, "executedAt"),
    durationMs: getNumber(tc, "durationMs"),
  };
  if (tc["result"] !== undefined) base["result"] = tc["result"];
  if (tc["error"] !== undefined) base["error"] = tc["error"] as string;
  return base as unknown as ToolCallRecord;
}

function deserializeError(e: Record<string, unknown>): ErrorRecord {
  return {
    cycle: getNumber(e, "cycle"),
    stage: getString(e, "stage"),
    message: getString(e, "message"),
    recoverable: getBoolean(e, "recoverable"),
    timestamp: getDate(e, "timestamp"),
  };
}

function deserializeFeedback(f: Record<string, unknown>): ExperienceFeedback {
  const base: Record<string, unknown> = {
    rating: getNumber(f, "rating") as ExperienceFeedback["rating"],
    correctedAt: getDate(f, "correctedAt"),
  };
  if (f["comment"] !== undefined) base["comment"] = f["comment"] as string;
  return base as unknown as ExperienceFeedback;
}

function deserializeRecord(raw: Record<string, unknown>): ExperienceRecord {
  const toolCallsRaw = (raw["toolCalls"] as Array<Record<string, unknown>>) ?? [];
  const errorsRaw = (raw["errors"] as Array<Record<string, unknown>>) ?? [];

  const record: Record<string, unknown> = {
    id: getString(raw, "id"),
    sessionId: getString(raw, "sessionId"),
    goal: getString(raw, "goal"),
    totalCycles: getNumber(raw, "totalCycles"),
    outcome: getString(raw, "outcome") as ExperienceOutcome,
    toolCalls: toolCallsRaw.map(deserializeToolCall),
    errors: errorsRaw.map(deserializeError),
    startedAt: getDate(raw, "startedAt"),
    completedAt: getDate(raw, "completedAt"),
    durationMs: getNumber(raw, "durationMs"),
    metadata: (raw["metadata"] as Readonly<Record<string, unknown>>) ?? {},
  };

  if (raw["finalReasoning"] !== undefined) record["finalReasoning"] = raw["finalReasoning"];
  if (raw["finalPlan"] !== undefined) record["finalPlan"] = raw["finalPlan"];
  if (raw["finalDecision"] !== undefined) record["finalDecision"] = raw["finalDecision"];
  if (raw["finalObservation"] !== undefined) record["finalObservation"] = raw["finalObservation"];
  if (raw["finalEvaluation"] !== undefined) record["finalEvaluation"] = raw["finalEvaluation"];
  if (raw["finalReflection"] !== undefined) record["finalReflection"] = raw["finalReflection"];
  if (raw["feedback"] !== undefined) record["feedback"] = deserializeFeedback(raw["feedback"] as Record<string, unknown>);
  if (raw["modelProvider"] !== undefined) record["modelProvider"] = raw["modelProvider"] as string;
  if (raw["modelId"] !== undefined) record["modelId"] = raw["modelId"] as string;

  return record as unknown as ExperienceRecord;
}

// ── Schema versioning ────────────────────────────────────────────
// Every line written from now on is wrapped as { schemaVersion, record }.
// Older files (written before this change) contain bare records with no
// envelope at all; those are treated as schema version 1 directly, since
// the record shape has never actually changed — this is not a fictional
// past version, it's the same shape without the wrapper. MIGRATIONS is
// the extension point for the next real format change; it is empty today
// because no such change has happened yet.
const CURRENT_SCHEMA_VERSION = 1;

type ExperienceMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, ExperienceMigration> = {};

function migrateToCurrent(raw: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Experience record schema version ${fromVersion} is newer than the supported version ${CURRENT_SCHEMA_VERSION}. Upgrade KAIROS to read this file.`,
    );
  }
  let current = raw;
  for (let version = fromVersion; version < CURRENT_SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (migrate === undefined) {
      throw new Error(`No migration registered to upgrade experience records from schema version ${version}.`);
    }
    current = migrate(current);
  }
  return current;
}

export class FileExperienceStore implements ExperienceStore {
  private readonly records = new Map<string, ExperienceRecord>();
  private readonly filePath: string;
  private skippedLines: SkippedLine[] = [];

  constructor(options: FileExperienceStoreOptions) {
    this.filePath = options.filePath;
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return;
    this.skippedLines = [];
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim() !== "");
      this.records.clear();
      for (const line of lines) {
        const record = this.parseLine(line);
        if (record !== undefined) this.records.set(record.id, record);
      }
    } catch (error) {
      throw new Error(
        "Failed to load experience store from " + this.filePath + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  async save(record: ExperienceRecord): Promise<ExperienceRecord> {
    this.records.set(record.id, record);
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const line = { schemaVersion: CURRENT_SCHEMA_VERSION, record };
    await appendFile(this.filePath, JSON.stringify(line) + "\n", "utf-8");
    return record;
  }

  async get(id: string): Promise<ExperienceRecord | undefined> {
    return this.records.get(id);
  }

  async query(filter: ExperienceQuery): Promise<readonly ExperienceRecord[]> {
    let results = [...this.records.values()];
    if (filter.outcome !== undefined) {
      results = results.filter((r) => r.outcome === filter.outcome);
    }
    if (filter.goalContains !== undefined) {
      const needle = filter.goalContains.toLowerCase();
      results = results.filter((r) => r.goal.toLowerCase().includes(needle));
    }
    if (filter.modelProvider !== undefined) {
      results = results.filter((r) => r.modelProvider === filter.modelProvider);
    }
    if (filter.sessionId !== undefined) {
      results = results.filter((r) => r.sessionId === filter.sessionId);
    }
    if (filter.since !== undefined) {
      const since = filter.since;
      results = results.filter((r) => r.startedAt >= since);
    }
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return filter.limit !== undefined ? results.slice(0, filter.limit) : results;
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.skippedLines = [];
    if (existsSync(this.filePath)) await writeFile(this.filePath, "", "utf-8");
  }

  async exportJsonl(): Promise<string> {
    return [...this.records.values()]
      .map((r) => JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, record: r }))
      .join("\n");
  }

  /** Lines that failed to parse or deserialize during the last load(), with reasons. */
  getSkippedLines(): readonly SkippedLine[] {
    return [...this.skippedLines];
  }

  getSkippedLineCount(): number {
    return this.skippedLines.length;
  }

  private parseLine(line: string): ExperienceRecord | undefined {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const hasEnvelope =
        typeof parsed["schemaVersion"] === "number" &&
        typeof parsed["record"] === "object" &&
        parsed["record"] !== null;

      const fromVersion = hasEnvelope ? (parsed["schemaVersion"] as number) : CURRENT_SCHEMA_VERSION;
      const rawRecord = hasEnvelope ? (parsed["record"] as Record<string, unknown>) : parsed;

      const migrated = migrateToCurrent(rawRecord, fromVersion);
      return deserializeRecord(migrated);
    } catch (error) {
      this.skippedLines.push({
        line,
        reason: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}