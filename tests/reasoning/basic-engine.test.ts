import { describe, expect, it } from "vitest";
import { BasicReasoningEngine } from "../../src/core/reasoning/engine/basic-engine.js";

describe("BasicReasoningEngine", () => {
  it("produces a structured reasoning result", async () => {
    const engine = new BasicReasoningEngine();

    const result = await engine.reason({
      goal: "Understand Nexus requirements",
      observations: ["Nexus supports multiple businesses"],
      constraints: ["Business data must remain isolated"],
    });

    expect(result.conclusion).toContain("Nexus requirements");
    expect(result.confidence).toBe(0.5);
    expect(result.reasoningSteps).toHaveLength(3);
  });
});
