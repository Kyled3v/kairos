import type { CognitiveContext } from "../context.js";
import { CognitiveStateMachine } from "../state-machine.js";
import type {
  CognitiveLoopEngine,
  CognitiveStepResult,
} from "./types.js";

export class BasicCognitiveLoopEngine implements CognitiveLoopEngine {
  async start(context: CognitiveContext): Promise<CognitiveContext> {
    return context;
  }

  async step(context: CognitiveContext): Promise<CognitiveStepResult> {
    const machine = new CognitiveStateMachine(context.state);

    const nextState = this.getNextState(context.state);

    if (!nextState) {
      return {
        state: context.state,
        summary: "Cognitive execution is complete.",
      };
    }

    machine.transition(nextState);

    return {
      state: nextState,
      nextState,
      summary: `Transitioned from ${context.state} to ${nextState}.`,
    };
  }

  private getNextState(
    state: CognitiveContext["state"],
  ): CognitiveStepResult["nextState"] {
    switch (state) {
      case "GOAL":
        return "UNDERSTAND";
      case "UNDERSTAND":
        return "REASON";
      case "REASON":
        return "PLAN";
      case "PLAN":
        return "DECIDE";
      case "DECIDE":
        return "ACT";
      case "ACT":
        return "OBSERVE";
      case "OBSERVE":
        return "EVALUATE";
      case "EVALUATE":
        return "REFLECT";
      case "REFLECT":
        return "COMPLETE";
      case "COMPLETE":
        return undefined;
    }
  }
}
