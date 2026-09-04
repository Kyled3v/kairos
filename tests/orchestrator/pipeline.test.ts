import { describe, expect, it } from "vitest";
import {
  executePipeline,
  type PipelineDependencies,
} from "../../src/core/orchestrator/pipeline.js";

describe("executePipeline", () => {
  it("executes every stage in order", async () => {
    const calls: string[] = [];

    const dependencies: PipelineDependencies = {
      async reason() {
        calls.push("reason");
        return {
          conclusion: "reasoned",
          confidence: 1,
          reasoningSteps: [],
        };
      },

      async plan() {
        calls.push("plan");
        return {
          goal: "test",
          steps: [
            {
              id: "step-1",
              order: 1,
              description: "test",
            },
          ],
          rationale: "test",
        };
      },

      async decide() {
        calls.push("decide");
        return {
          selectedOptionId: "option-1",
          rationale: "test",
          confidence: 1,
          requiresAuthorization: false,
          blocked: false,
          options: [
            {
              id: "option-1",
              description: "test",
              goalFit: 1,
              confidence: 1,
              risk: 0,
              authorized: true,
            },
          ],
        };
      },

      async observe() {
        calls.push("observe");
        return {
          id: "obs-1",
          timestamp: new Date(),
          source: "test",
          data: {},
        };
      },

      async evaluate() {
        calls.push("evaluate");
        return {
          success: true,
          score: 1.0,
          explanation: "test",
          discrepancies: [],
          completed: true,
        };
      },

      async reflect() {
        calls.push("reflect");
        return {
          summary: "test",
          lessons: [],
          continueTask: false,
          reason: "test",
        };
      },
    };

    const result = await executePipeline(
      "test",
      dependencies,
      { cycle: 1 },
    );

    expect(result).toBeDefined();
    expect(calls).toEqual([
      "reason",
      "plan",
      "decide",
      "observe",
      "evaluate",
      "reflect",
    ]);
  });
});
