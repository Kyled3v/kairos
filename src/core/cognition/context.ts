import type { CognitiveState } from "./states/types.js";

export interface CognitiveContext {
  readonly id: string;
  readonly goal: string;
  readonly state: CognitiveState;
  readonly cycle: number;
  readonly observations: readonly string[];
  readonly decisions: readonly string[];
  readonly actions: readonly string[];
  readonly results: readonly string[];
  readonly createdAt: Date;
}

export function createCognitiveContext(
  goal: string,
): CognitiveContext {
  return {
    id: crypto.randomUUID(),
    goal,
    state: "GOAL",
    cycle: 0,
    observations: [],
    decisions: [],
    actions: [],
    results: [],
    createdAt: new Date(),
  };
}
