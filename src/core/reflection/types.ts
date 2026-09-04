import type { Evaluation } from "../evaluation/types.js";

export interface Reflection {
  readonly summary: string;
  readonly lessons: readonly string[];
  readonly continueTask: boolean;
  readonly reason: string;
}

export interface ReflectionContext {
  readonly goal: string;
  readonly evaluation: Evaluation;
}

export interface ReflectionEngine {
  reflect(context: ReflectionContext): Promise<Reflection>;
}
