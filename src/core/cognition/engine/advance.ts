import type { CognitiveExecution } from "./execution.js";
import { CognitiveStateMachine } from "../state-machine.js";
import type { CognitiveStepResult } from "./types.js";

export interface ExecutionStepResult extends CognitiveStepResult {
  readonly execution: CognitiveExecution;
}

export function advanceExecution(
  execution: CognitiveExecution,
): ExecutionStepResult {
  const machine = new CognitiveStateMachine(execution.currentState);
  const nextState = getNextState(execution.currentState);

  if (!nextState) {
    return {
      state: execution.currentState,
      summary: "Cognitive execution is complete.",
      execution,
    };
  }

  machine.transition(nextState);

  const cycle = execution.cycle + 1;
  const summary =
    `Transitioned from ${execution.currentState} to ${nextState}.`;

  const transition = {
    from: execution.currentState,
    to: nextState,
    cycle,
    timestamp: new Date(),
    summary,
  };

  const completed = nextState === "COMPLETE";

  const updatedExecution: CognitiveExecution = {
    ...execution,
    currentState: nextState,
    cycle,
    transitions: [...execution.transitions, transition],
    completed,
    ...(completed ? { completedAt: new Date() } : {}),
  };

  return {
    state: nextState,
    nextState,
    summary,
    execution: updatedExecution,
  };
}

function getNextState(
  state: CognitiveExecution["currentState"],
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
