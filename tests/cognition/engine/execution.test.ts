import { describe, expect, it } from "vitest";
import {
  createCognitiveExecution,
} from "../../../src/core/cognition/engine/execution.js";
import {
  advanceExecution,
} from "../../../src/core/cognition/engine/advance.js";

describe("Cognitive execution", () => {
  it("records the complete cognitive cycle", () => {
    let execution = createCognitiveExecution("Test KAIROS goal");

    expect(execution.currentState).toBe("GOAL");
    expect(execution.cycle).toBe(0);
    expect(execution.transitions).toHaveLength(0);
    expect(execution.completed).toBe(false);

    while (!execution.completed) {
      const result = advanceExecution(execution);
      execution = result.execution;
    }

    expect(execution.currentState).toBe("COMPLETE");
    expect(execution.cycle).toBe(9);
    expect(execution.transitions).toHaveLength(9);
    expect(execution.completed).toBe(true);
    expect(execution.completedAt).toBeInstanceOf(Date);
  });

  it("records transitions in the correct order", () => {
    let execution = createCognitiveExecution("Test ordering");

    while (!execution.completed) {
      execution = advanceExecution(execution).execution;
    }

    const states = execution.transitions.map((transition) => transition.to);

    expect(states).toEqual([
      "UNDERSTAND",
      "REASON",
      "PLAN",
      "DECIDE",
      "ACT",
      "OBSERVE",
      "EVALUATE",
      "REFLECT",
      "COMPLETE",
    ]);
  });
});
