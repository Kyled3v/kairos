import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { ModelPlanningEngine } from "../../src/intelligence/planning/model-planning-engine.js";

describe("ModelPlanningEngine", () => {
  it("produces a valid plan via the model router", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const engine = new ModelPlanningEngine(router, {
      providerId: "mock",
      modelId: "mock-model",
    });

    const result = await engine.plan({
      goal: "Understand Nexus requirements",
      reasoning: {
        conclusion: "Nexus requires isolated business workspaces.",
        confidence: 0.8,
        reasoningSteps: ["Reviewed the requirements."],
      },
    });

    expect(result.goal).toBe("Understand Nexus requirements");
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0]?.id).toBeTypeOf("string");
    expect(result.rationale).toBeTypeOf("string");
  });
});