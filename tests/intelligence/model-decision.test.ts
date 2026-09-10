import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { ModelDecisionEngine } from "../../src/intelligence/decision/model-decision-engine.js";

const plan = {
  goal: "Understand Nexus",
  rationale: "Analysis required.",
  steps: [
    { id: "step-1", description: "Clarify requirements.", order: 1 },
    { id: "step-2", description: "Determine actions.", order: 2 },
    { id: "step-3", description: "Evaluate outcome.", order: 3 },
  ],
};

describe("ModelDecisionEngine", () => {
  it("produces a valid decision when authorized", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const engine = new ModelDecisionEngine(router, {
      providerId: "mock",
      modelId: "mock-model",
    });

    const result = await engine.decide({
      goal: "Understand Nexus",
      plan,
      authorized: true,
    });

    expect(result.blocked).toBe(false);
    expect(result.requiresAuthorization).toBe(false);
    expect(result.options).toHaveLength(3);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("blocks when not authorized", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const engine = new ModelDecisionEngine(router, {
      providerId: "mock",
      modelId: "mock-model",
    });

    const result = await engine.decide({
      goal: "Understand Nexus",
      plan,
      authorized: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.requiresAuthorization).toBe(true);
    expect(result.selectedOptionId).toBeUndefined();
  });
});