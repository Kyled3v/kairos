import { describe, expect, it } from "vitest";
import {
  ModelRouter,
  MockModelProvider,
} from "../../src/intelligence/index.js";
import { ModelReasoningEngine } from "../../src/intelligence/index.js";

describe("ModelReasoningEngine", () => {
  it("uses the model router to perform reasoning", async () => {
    const router = new ModelRouter();

    router.register(new MockModelProvider());

    const engine = new ModelReasoningEngine(
      router,
      {
        providerId: "mock",
        modelId: "mock-model",
      },
    );

    const result = await engine.reason({
      goal: "Understand Nexus",
      observations: [
        "Nexus supports multiple businesses.",
      ],
      constraints: [
        "Keep businesses isolated.",
      ],
    });

    expect(result.conclusion).toContain(
      "Understand Nexus",
    );
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasoningSteps.length).toBeGreaterThan(0);
  });
});
