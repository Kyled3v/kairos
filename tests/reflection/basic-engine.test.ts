import { describe, expect, it } from "vitest";
import { BasicReflectionEngine } from "../../src/core/reflection/basic-engine.js";

const failedEvaluation = {
  success: false,
  completed: false,
  score: 0,
  explanation: "Action failed.",
  discrepancies: ["Expected completion was not observed."],
};

describe("BasicReflectionEngine", () => {
  it("stops when the objective succeeds", async () => {
    const engine = new BasicReflectionEngine();

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

    expect(result.continueTask).toBe(false);
    expect(result.lessons.length).toBeGreaterThan(0);
  });

  it("requests another cycle after failure", async () => {
    const engine = new BasicReflectionEngine();

    const result = await engine.reflect({
      goal: "Build Nexus",
      evaluation: failedEvaluation,
    });

    expect(result.continueTask).toBe(true);
    expect(result.lessons).toContain(
      "Expected completion was not observed.",
    );
  });
});
