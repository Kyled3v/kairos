import type { MultiCycleResult } from "../orchestrator/types.js";
import type { ToolCallRecord, ErrorRecord, ExperienceRecord, ExperienceOutcome } from "./record.js";

export interface ExperienceRecorderOptions {
  readonly sessionId: string;
  readonly modelProvider?: string;
  readonly modelId?: string;
}

export function recordFromMultiCycleResult(
  result: MultiCycleResult,
  options: ExperienceRecorderOptions,
  startedAt: Date,
  toolCalls: readonly ToolCallRecord[] = [],
  errors: readonly ErrorRecord[] = [],
): ExperienceRecord {
  const completedAt = new Date();

  const outcome: ExperienceOutcome =
    result.status === "completed"
      ? "success"
      : result.status === "failed"
        ? "failure"
        : result.status === "blocked"
          ? "partial"
          : "unknown";

  const base: ExperienceRecord = {
    id: crypto.randomUUID(),
    sessionId: options.sessionId,
    goal: result.goal,
    totalCycles: result.totalCycles,
    outcome,
    toolCalls,
    errors,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    metadata: {
      terminationReason: result.terminationReason,
      cycleCount: result.totalCycles,
    },
  };

  const withReasoning =
    result.finalReasoning !== undefined
      ? { ...base, finalReasoning: result.finalReasoning }
      : base;
  const withPlan =
    result.finalPlan !== undefined
      ? { ...withReasoning, finalPlan: result.finalPlan }
      : withReasoning;
  const withDecision =
    result.finalDecision !== undefined
      ? { ...withPlan, finalDecision: result.finalDecision }
      : withPlan;
  const withObservation =
    result.finalObservation !== undefined
      ? { ...withDecision, finalObservation: result.finalObservation }
      : withDecision;
  const withEvaluation =
    result.finalEvaluation !== undefined
      ? { ...withObservation, finalEvaluation: result.finalEvaluation }
      : withObservation;
  const withReflection =
    result.finalReflection !== undefined
      ? { ...withEvaluation, finalReflection: result.finalReflection }
      : withEvaluation;
  const withProvider =
    options.modelProvider !== undefined
      ? { ...withReflection, modelProvider: options.modelProvider }
      : withReflection;

  return options.modelId !== undefined
    ? { ...withProvider, modelId: options.modelId }
    : withProvider;
}
