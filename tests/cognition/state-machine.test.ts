import { describe, expect, it } from "vitest";
import { CognitiveStateMachine } from "../../src/core/cognition/state-machine.js";

describe("CognitiveStateMachine", () => {
  it("starts at GOAL", () => {
    const machine = new CognitiveStateMachine();

    expect(machine.getState()).toBe("GOAL");
  });

  it("allows valid transitions", () => {
    const machine = new CognitiveStateMachine();

    machine.transition("UNDERSTAND");
    machine.transition("REASON");

    expect(machine.getState()).toBe("REASON");
  });

  it("rejects invalid transitions", () => {
    const machine = new CognitiveStateMachine();

    expect(() => machine.transition("ACT")).toThrow(
      "Invalid cognitive transition",
    );
  });

  it("allows REFLECT to continue or complete", () => {
    const machine = new CognitiveStateMachine("REFLECT");

    machine.transition("UNDERSTAND");

    expect(machine.getState()).toBe("UNDERSTAND");
  });
});
