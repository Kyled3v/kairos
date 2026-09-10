import type { ReasoningResult } from "../reasoning/types.js";
import type { Plan } from "../planning/types.js";
import type { Decision } from "../decision/types.js";
import type { Observation } from "../observation/types.js";
import type { Evaluation } from "../evaluation/types.js";
import type { Reflection } from "../reflection/types.js";

export type ExperienceOutcome = "success" | "failure" | "partial" | "unknown";

export interface ExperienceRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly goal: string;
  readonly totalCycles: number;
  readonly outcome: ExperienceOutcome;
  readonly finalReasoning?: ReasoningResult;
  readonly finalPlan?: Plan;
  readonly finalDecision?: Decision;
  readonly finalObservation?: Observation;
  readonly finalEvaluation?: Evaluation;
  readonly finalReflection?: Reflection;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly errors: readonly ErrorRecord[];
  readonly feedback?: ExperienceFeedback;
  readonly modelProvider?: string;
  readonly modelId?: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ToolCallRecord {
  readonly toolId: string;
  readonly requestId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly status: "success" | "failure" | "blocked";
  readonly result?: unknown;
  readonly error?: string;
  readonly executedAt: Date;
  readonly durationMs: number;
}

export interface ErrorRecord {
  readonly cycle: number;
  readonly stage: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly timestamp: Date;
}

export interface ExperienceFeedback {
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly comment?: string;
  readonly correctedAt: Date;
}

export interface ExperienceStore {
  save(record: ExperienceRecord): Promise<ExperienceRecord>;
  get(id: string): Promise<ExperienceRecord | undefined>;
  query(filter: ExperienceQuery): Promise<readonly ExperienceRecord[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export interface ExperienceQuery {
  readonly outcome?: ExperienceOutcome;
  readonly goalContains?: string;
  readonly modelProvider?: string;
  readonly sessionId?: string;
  readonly since?: Date;
  readonly limit?: number;
}