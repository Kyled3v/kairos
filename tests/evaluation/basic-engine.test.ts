import { describe, expect, it } from "vitest";
import { BasicEvaluationEngine } from "../../src/core/evaluation/basic-engine.js";

describe("BasicEvaluationEngine", () => {
  it("recognizes a successful observed action", async () => {
    const engine = new BasicEvaluationEngine();

    const result = await engine.evaluate({
      goal: "Build Nexus",
      observation: {
        id: "observation-1",
        timestamp: new Date(),
        source: "action-execution",
        data: {
          actionId: "action-1",
          actualOutcome: { status: "completed" },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.score).toBe(1);
    expect(result.discrepancies).toHaveLength(0);
  });

  it("detects an unsuccessful observed action", async () => {
    const engine = new BasicEvaluationEngine();

    const result = await engine.evaluate({
      goal: "Build Nexus",
      observation: {
        id: "observation-2",
        timestamp: new Date(),
        source: "action-execution",
        data: {
          actionId: "action-2",
          actualOutcome: { status: "failed" },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.score).toBe(0);
    expect(result.discrepancies.length).toBeGreaterThan(0);
  });
});
