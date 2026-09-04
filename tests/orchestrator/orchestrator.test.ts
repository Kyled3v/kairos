import { describe, expect, it } from "vitest";
import {
  BasicKairosOrchestrator,
} from "../../src/core/orchestrator/orchestrator.js";
import type {
  PipelineDependencies,
} from "../../src/core/orchestrator/pipeline.js";

function createDependencies(): PipelineDependencies {
  return {
    async reason() {
      return {
        conclusion: "Reasoned successfully.",
        confidence: 0.9,
        reasoningSteps: ["Analyzed the goal."],
      };
    },

    async plan() {
      return {
        goal: "Test goal",
        steps: [
          {
            id: "step-1",
            order: 1,
            description: "Complete the objective.",
          },
        ],
        rationale: "Direct execution is sufficient.",
      };
    },

    async decide() {
      return {
        selectedOptionId: "option-1",
        rationale: "It is the best available option.",
        confidence: 0.9,
        requiresAuthorization: false,
        blocked: false,
        options: [
          {
            id: "option-1",
            description: "Complete the objective.",
            goalFit: 0.9,
            confidence: 0.9,
            risk: 0.1,
            authorized: true,
          },
        ],
      };
    },

    async observe() {
      return {
        id: "obs-1",
        timestamp: new Date(),
        source: "test",
        data: {},
      };
    },

    async evaluate() {
      return {
        success: true,
        score: 1.0,
        explanation: "Objective achieved.",
        discrepancies: [],
        completed: true,
      };
    },

    async reflect() {
      return {
        summary: "The objective was achieved successfully.",
        lessons: ["Direct execution worked."],
        continueTask: false,
        reason: "Objective completed.",
      };
    },
  };
}

describe("BasicKairosOrchestrator", () => {
  it("executes the complete orchestration pipeline", async () => {
    const orchestrator = new BasicKairosOrchestrator(
      createDependencies(),
    );

    const result = await orchestrator.run({
      goal: "Test goal",
    });

    expect(result.status).toBe("completed");
    expect(result.cycles).toBe(1);
    expect(result.reasoning).toBeDefined();
    expect(result.plan).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(result.observation).toBeDefined();
    expect(result.evaluation).toBeDefined();
    expect(result.reflection).toBeDefined();
    expect(result.terminationReason).toBe(
      "Objective completed.",
    );
  });

  it("rejects an empty goal", async () => {
    const orchestrator = new BasicKairosOrchestrator(
      createDependencies(),
    );

    await expect(
      orchestrator.run({ goal: "   " }),
    ).rejects.toThrow(
      "Orchestration goal cannot be empty.",
    );
  });
});
