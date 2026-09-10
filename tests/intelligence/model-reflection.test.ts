import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { ModelReflectionEngine } from "../../src/intelligence/reflection/model-reflection-engine.js";

describe("ModelReflectionEngine", () => {
  it("produces a valid reflection", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const engine = new ModelReflectionEngine(router, {
      providerId: "mock",
      modelId: "mock-model",
    });

    const result = await engine.reflect({
      goal: "Build Nexus",
      evaluation: {
        success: true,
        completed: true,
        score: 1,
        explanation: "Action succeeded.",
        discrepancies: [],
      },
    });

    expect(result.summary).toBeTypeOf("string");
    expect(Array.isArray(result.lessons)).toBe(true);
    expect(typeof result.continueTask).toBe("boolean");
    expect(result.reason).toBeTypeOf("string");
  });
});