import { describe, expect, it } from "vitest";
import { createCognitiveContext } from "../../../src/core/cognition/context.js";
import { BasicCognitiveLoopEngine } from "../../../src/core/cognition/engine/basic-engine.js";

describe("BasicCognitiveLoopEngine", () => {
  it("starts with the supplied cognitive context", async () => {
    const engine = new BasicCognitiveLoopEngine();
    const context = createCognitiveContext("Test goal");

    const result = await engine.start(context);

    expect(result).toBe(context);
    expect(result.state).toBe("GOAL");
  });

  it("advances the cognitive state", async () => {
    const engine = new BasicCognitiveLoopEngine();
    const context = createCognitiveContext("Test goal");

    const result = await engine.step(context);

    expect(result.state).toBe("UNDERSTAND");
    expect(result.nextState).toBe("UNDERSTAND");
  });

  it("recognizes COMPLETE as terminal", async () => {
    const engine = new BasicCognitiveLoopEngine();
    const context = {
      ...createCognitiveContext("Test goal"),
      state: "COMPLETE" as const,
    };

    const result = await engine.step(context);

    expect(result.state).toBe("COMPLETE");
    expect(result.nextState).toBeUndefined();
  });
});
