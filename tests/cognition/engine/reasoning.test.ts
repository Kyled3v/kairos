import { describe, expect, it } from "vitest";
import { createCognitiveContext } from "../../../src/core/cognition/context.js";
import { executeReasoning } from "../../../src/core/cognition/engine/reasoning.js";
import { BasicReasoningEngine } from "../../../src/core/reasoning/engine/basic-engine.js";

describe("Cognitive reasoning execution", () => {
  it("executes reasoning only during the REASON state", async () => {
    const context = {
      ...createCognitiveContext("Understand Nexus requirements"),
      state: "REASON" as const,
      observations: ["Nexus supports multiple businesses"],
    };

    const engine = new BasicReasoningEngine();

    const result = await executeReasoning(engine, context);

    expect(result.reasoning.conclusion).toContain(
      "Nexus requirements",
    );
    expect(result.reasoning.reasoningSteps.length).toBeGreaterThan(0);
  });

  it("rejects reasoning outside the REASON state", async () => {
    const context = createCognitiveContext("Test goal");
    const engine = new BasicReasoningEngine();

    await expect(
      executeReasoning(engine, context),
    ).rejects.toThrow("REASON state");
  });
});
