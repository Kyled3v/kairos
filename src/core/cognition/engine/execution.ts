import type { CognitiveState } from "../states/types.js";

export interface CognitiveTransition {
  readonly from: CognitiveState;
  readonly to: CognitiveState;
  readonly cycle: number;
  readonly timestamp: Date;
  readonly summary: string;
}

export interface CognitiveExecution {
  readonly id: string;
  readonly goal: string;
  readonly currentState: CognitiveState;
  readonly cycle: number;
  readonly transitions: readonly CognitiveTransition[];
  readonly completed: boolean;
  readonly createdAt: Date;
  readonly completedAt?: Date;
}

export function createCognitiveExecution(
  goal: string,
): CognitiveExecution {
  return {
    id: crypto.randomUUID(),
    goal,
    currentState: "GOAL",
    cycle: 0,
    transitions: [],
    completed: false,
    createdAt: new Date(),
  };
}
