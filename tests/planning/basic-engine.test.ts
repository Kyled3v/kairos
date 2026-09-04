import { describe, expect, it } from "vitest";
import { BasicPlanningEngine } from "../../src/core/planning/basic-engine.js";

describe("BasicPlanningEngine", () => {
  it("creates a structured plan from reasoning", async () => {
    const engine = new BasicPlanningEngine();

    const result = await engine.plan({
      goal: "Understand Nexus requirements",
      reasoning: {
        conclusion: "Nexus requires isolated business workspaces.",
        confidence: 0.8,
        reasoningSteps: [
          "Reviewed the requirements.",
          "Identified business isolation as a constraint.",
        ],
      },
    });

    expect(result.goal).toBe("Understand Nexus requirements");
    expect(result.steps).toHaveLength(3);

    const firstStep = result.steps[0];
    const lastStep = result.steps[2];

    expect(firstStep).toBeDefined();
    expect(lastStep).toBeDefined();

    expect(firstStep?.order).toBe(1);
    expect(lastStep?.order).toBe(3);

    expect(result.rationale).toContain("isolated business workspaces");
  });
});
