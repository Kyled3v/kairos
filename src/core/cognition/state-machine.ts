import type { CognitiveState } from "./states/types.js";
import { canTransition } from "./transitions/rules.js";

export class CognitiveStateMachine {
  private state: CognitiveState;

  constructor(initialState: CognitiveState = "GOAL") {
    this.state = initialState;
  }

  getState(): CognitiveState {
    return this.state;
  }

  transition(nextState: CognitiveState): void {
    if (!canTransition(this.state, nextState)) {
      throw new Error(
        `Invalid cognitive transition: ${this.state} -> ${nextState}`,
      );
    }

    this.state = nextState;
  }
}
