import type { CognitiveState } from "../states/types.js";
import type { CognitiveContext } from "../context.js";

export interface CognitiveStepResult {
  readonly state: CognitiveState;
  readonly summary: string;
  readonly nextState?: CognitiveState;
}

export interface CognitiveLoopEngine {
  start(context: CognitiveContext): Promise<CognitiveContext>;
  step(context: CognitiveContext): Promise<CognitiveStepResult>;
}
