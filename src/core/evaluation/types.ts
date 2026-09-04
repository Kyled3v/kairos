import type { Observation } from "../observation/types.js";

export interface Evaluation {
  readonly success: boolean;
  readonly score: number;
  readonly explanation: string;
  readonly discrepancies: readonly string[];
  readonly completed: boolean;
}

export interface EvaluationContext {
  readonly goal: string;
  readonly observation: Observation;
}

export interface EvaluationEngine {
  evaluate(context: EvaluationContext): Promise<Evaluation>;
}
