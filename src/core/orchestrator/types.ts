import type { Decision } from "../decision/types.js";
import type { Evaluation } from "../evaluation/types.js";
import type { Observation } from "../observation/types.js";
import type { Plan } from "../planning/types.js";
import type { ReasoningResult } from "../reasoning/types.js";
import type { Reflection } from "../reflection/types.js";

export type OrchestrationStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked";

export interface OrchestrationRequest {
  readonly goal: string;
  readonly maxCycles?: number;
}

export interface OrchestrationResult {
  readonly goal: string;
  readonly status: OrchestrationStatus;
  readonly cycles: number;
  readonly reasoning?: ReasoningResult;
  readonly plan?: Plan;
  readonly decision?: Decision;
  readonly observation?: Observation;
  readonly evaluation?: Evaluation;
  readonly reflection?: Reflection;
  readonly terminationReason?: string;
}

export interface OrchestrationContext {
  readonly goal: string;
  readonly cycle: number;
  readonly reasoning?: ReasoningResult;
  readonly plan?: Plan;
  readonly decision?: Decision;
  readonly observation?: Observation;
  readonly evaluation?: Evaluation;
  readonly reflection?: Reflection;
}
