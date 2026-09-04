import { describe, expect, it } from "vitest";
import { BasicDecisionEngine } from "../../src/core/decision/engine/basic-engine.js";

const plan = {
  goal: "Understand Nexus requirements",
  rationale: "Nexus requires isolated business workspaces.",
  steps: [
    {
      id: "step-1",
      description: "Clarify the requirements.",
      order: 1,
    },
    {
      id: "step-2",
      description: "Determine required actions.",
      order: 2,
    },
    {
      id: "step-3",
      description: "Evaluate the outcome.",
      order: 3,
    },
  ],
};

describe("BasicDecisionEngine", () => {
  it("selects an authorized option", async () => {
    const engine = new BasicDecisionEngine();

    const result = await engine.decide({
      goal: plan.goal,
      plan,
      authorized: true,
    });

    expect(result.blocked).toBe(false);
    expect(result.requiresAuthorization).toBe(false);
    expect(result.selectedOptionId).toBe("step-1");
    expect(result.options).toHaveLength(3);
  });

  it("blocks execution when authorization is unavailable", async () => {
    const engine = new BasicDecisionEngine();

    const result = await engine.decide({
      goal: plan.goal,
      plan,
      authorized: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.requiresAuthorization).toBe(true);
    expect(result.selectedOptionId).toBeUndefined();
  });
});
