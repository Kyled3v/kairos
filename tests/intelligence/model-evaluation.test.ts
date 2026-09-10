import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { ModelEvaluationEngine } from "../../src/intelligence/evaluation/model-evaluation-engine.js";

describe("ModelEvaluationEngine", () => {
  it("produces a valid evaluation", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const engine = new ModelEvaluationEngine(router, {
      providerId: "mock",
      modelId: "mock-model",
    });

    const result = await engine.evaluate({
      goal: "Build Nexus",
      observation: {
        id: "obs-1",
        timestamp: new Date(),
        source: "action-execution",
        data: {
          actionId: "action-1",
          actualOutcome: { status: "completed" },
        },
      },
    });

    expect(typeof result.success).toBe("boolean");
    expect(typeof result.completed).toBe("boolean");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.explanation).toBeTypeOf("string");
    expect(Array.isArray(result.discrepancies)).toBe(true);
  });
});