import { describe, expect, it } from "vitest";
import { MultiCycleOrchestrator } from "../../src/core/orchestrator/multi-cycle-orchestrator.js";
import type { PipelineDependencies } from "../../src/core/orchestrator/pipeline.js";

// ── Fixture helpers ────────────────────────────────────────

function makeSuccessDeps(): PipelineDependencies {
  return {
    async reason() {
      return {
        conclusion: "Goal is achievable.",
        confidence: 0.9,
        reasoningSteps: ["Analysed the goal."],
      };
    },
    async plan() {
      return {
        goal: "test",
        rationale: "Direct execution.",
        steps: [
          { id: "step-1", description: "Execute.", order: 1 },
        ],
      };
    },
    async decide() {
      return {
        selectedOptionId: "step-1",
        rationale: "Only option.",
        confidence: 0.9,
        requiresAuthorization: false,
        blocked: false,
        options: [
          {
            id: "step-1",
            description: "Execute.",
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
        id: crypto.randomUUID(),
        timestamp: new Date(),
        source: "test",
        data: { actualOutcome: { status: "completed" } },
      };
    },
    async evaluate() {
      return {
        success: true,
        completed: true,
        score: 1.0,
        explanation: "Objective achieved.",
        discrepancies: [],
      };
    },
    async reflect() {
      return {
        summary: "Objective achieved.",
        lessons: ["Worked first time."],
        continueTask: false,
        reason: "Complete.",
      };
    },
  };
}

function makeBlockedDeps(): PipelineDependencies {
  return {
    async reason() {
      return {
        conclusion: "Attempting goal.",
        confidence: 0.5,
        reasoningSteps: ["Analysed."],
      };
    },
    async plan() {
      return {
        goal: "test",
        rationale: "Plan.",
        steps: [{ id: "step-1", description: "Act.", order: 1 }],
      };
    },
    async decide() {
      return {
        rationale: "Blocked — needs authorization.",
        confidence: 0,
        requiresAuthorization: true,
        blocked: true,
        options: [
          {
            id: "step-1",
            description: "Act.",
            goalFit: 0.9,
            confidence: 0.9,
            risk: 0.1,
            authorized: false,
          },
        ],
      };
    },
    async observe() {
      return {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        source: "test",
        data: {},
      };
    },
    async evaluate() {
      return {
        success: false,
        completed: false,
        score: 0,
        explanation: "Blocked.",
        discrepancies: [],
      };
    },
    async reflect() {
      return {
        summary: "Blocked.",
        lessons: [],
        continueTask: false,
        reason: "Authorization required.",
      };
    },
  };
}

// ── Tests ──────────────────────────────────────────────────

describe("MultiCycleOrchestrator", () => {
  it("completes successfully in a single cycle", async () => {
    const orchestrator = new MultiCycleOrchestrator(
      makeSuccessDeps(),
    );

    const result = await orchestrator.run({
      goal: "Achieve the objective.",
    });

    expect(result.status).toBe("completed");
    expect(result.terminationReason).toBe("objective-completed");
    expect(result.totalCycles).toBe(1);
    expect(result.cycleHistory).toHaveLength(1);
    expect(result.finalEvaluation?.completed).toBe(true);
  });

  it("records full cycle history across multiple cycles", async () => {
    let callCount = 0;

    const deps: PipelineDependencies = {
      async reason() {
        return {
          conclusion: "Attempting goal.",
          confidence: 0.5,
          reasoningSteps: ["Analysed."],
        };
      },
      async plan() {
        return {
          goal: "test",
          rationale: "Try again.",
          steps: [{ id: "step-1", description: "Retry.", order: 1 }],
        };
      },
      async decide() {
        return {
          selectedOptionId: "step-1",
          rationale: "Only option.",
          confidence: 0.5,
          requiresAuthorization: false,
          blocked: false,
          options: [
            {
              id: "step-1",
              description: "Retry.",
              goalFit: 0.5,
              confidence: 0.5,
              risk: 0.2,
              authorized: true,
            },
          ],
        };
      },
      async observe() {
        return {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          source: "test",
          data: { actualOutcome: { status: "failed" } },
        };
      },
      async evaluate() {
        callCount += 1;
        const completed = callCount >= 3;
        return {
          success: completed,
          completed,
          score: completed ? 1.0 : callCount * 0.1,
          explanation: completed ? "Done." : "Still working.",
          discrepancies: completed ? [] : ["Not done."],
        };
      },
      async reflect() {
        return {
          summary: "Need to retry.",
          lessons: ["Retry with different approach."],
          continueTask: true,
          reason: "Not complete.",
        };
      },
    };

    const orchestrator = new MultiCycleOrchestrator(deps, {
      maxCycles: 5,
    });

    const result = await orchestrator.run({
      goal: "Multi-cycle goal.",
      maxCycles: 5,
    });

    expect(result.totalCycles).toBeGreaterThanOrEqual(3);
    expect(result.cycleHistory.length).toBeGreaterThanOrEqual(3);
    expect(result.cycleHistory[0]?.cycle).toBe(1);
  });

  it("terminates due to max cycles", async () => {
    // Scores drift slightly each cycle so convergence never fires,
    // but never reach completed so max-cycles termination wins.
    let cycle = 0;

    const deps: PipelineDependencies = {
      async reason() {
        return {
          conclusion: "Attempting.",
          confidence: 0.5,
          reasoningSteps: [],
        };
      },
      async plan() {
        return {
          goal: "test",
          rationale: "Plan.",
          steps: [{ id: "step-1", description: "Act.", order: 1 }],
        };
      },
      async decide() {
        return {
          selectedOptionId: "step-1",
          rationale: "Only option.",
          confidence: 0.5,
          requiresAuthorization: false,
          blocked: false,
          options: [
            {
              id: "step-1",
              description: "Act.",
              goalFit: 0.5,
              confidence: 0.5,
              risk: 0.2,
              authorized: true,
            },
          ],
        };
      },
      async observe() {
        return {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          source: "test",
          data: {},
        };
      },
      async evaluate() {
        cycle += 1;
        // Scores vary enough to avoid convergence: 0.1, 0.3, 0.5
        return {
          success: false,
          completed: false,
          score: cycle * 0.2,
          explanation: "Still working.",
          discrepancies: ["Not done."],
        };
      },
      async reflect() {
        return {
          summary: "Need to retry.",
          lessons: [],
          continueTask: true,
          reason: "Not complete.",
        };
      },
    };

    const orchestrator = new MultiCycleOrchestrator(deps, {
      maxCycles: 3,
      convergenceThreshold: 0.01,
    });

    const result = await orchestrator.run({
      goal: "Impossible goal.",
      maxCycles: 3,
    });

    expect(result.terminationReason).toBe("max-cycles-reached");
    expect(result.totalCycles).toBe(3);
    expect(result.status).toBe("running");
  });

  it("detects blocked authorization and terminates", async () => {
    const orchestrator = new MultiCycleOrchestrator(
      makeBlockedDeps(),
    );

    const result = await orchestrator.run({
      goal: "Blocked goal.",
    });

    expect(result.status).toBe("blocked");
    expect(result.terminationReason).toBe(
      "blocked-by-authorization",
    );
    expect(result.totalCycles).toBe(1);
  });

  it("detects no-progress and terminates", async () => {
    // Scores are exactly 0.0 every cycle — flat, not converging
    // Use a high convergenceThreshold so hasConverged() never fires,
    // but hasNoProgress() fires after noProgressThreshold cycles.
    const deps: PipelineDependencies = {
      async reason() {
        return {
          conclusion: "Attempting.",
          confidence: 0.5,
          reasoningSteps: [],
        };
      },
      async plan() {
        return {
          goal: "test",
          rationale: "Plan.",
          steps: [{ id: "step-1", description: "Act.", order: 1 }],
        };
      },
      async decide() {
        return {
          selectedOptionId: "step-1",
          rationale: "Only option.",
          confidence: 0.5,
          requiresAuthorization: false,
          blocked: false,
          options: [
            {
              id: "step-1",
              description: "Act.",
              goalFit: 0.5,
              confidence: 0.5,
              risk: 0.2,
              authorized: true,
            },
          ],
        };
      },
      async observe() {
        return {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          source: "test",
          data: {},
        };
      },
      async evaluate() {
        return {
          success: false,
          completed: false,
          score: 0.5,
          explanation: "No progress.",
          discrepancies: ["Stuck."],
        };
      },
      async reflect() {
        return {
          summary: "Stuck.",
          lessons: [],
          continueTask: true,
          reason: "Not complete.",
        };
      },
    };

    // convergenceThreshold=0.6 means delta < 0.6 is "converging"
    // but hasConverged() needs 3 consecutive converging scores.
    // hasNoProgress() fires after 3 scores within threshold of each other.
    // Since both detect the same flat signal, no-progress must be
    // checked BEFORE convergence in the orchestrator loop.
    // The orchestrator currently checks convergence first — fix that
    // ordering so no-progress takes precedence when score is flat at non-1.
    const orchestrator = new MultiCycleOrchestrator(deps, {
      maxCycles: 10,
      noProgressThreshold: 3,
      convergenceThreshold: 0.001,
    });

    const result = await orchestrator.run({
      goal: "Stuck goal.",
      maxCycles: 10,
      noProgressThreshold: 3,
      convergenceThreshold: 0.001,
    });

    expect(result.terminationReason).toBe("no-progress-detected");
    expect(result.status).toBe("failed");
  });

  it("detects convergence and terminates", async () => {
    let cycle = 0;

    const deps: PipelineDependencies = {
      async reason() {
        return {
          conclusion: "Attempting.",
          confidence: 0.5,
          reasoningSteps: [],
        };
      },
      async plan() {
        return {
          goal: "test",
          rationale: "Plan.",
          steps: [{ id: "step-1", description: "Act.", order: 1 }],
        };
      },
      async decide() {
        return {
          selectedOptionId: "step-1",
          rationale: "Only option.",
          confidence: 0.8,
          requiresAuthorization: false,
          blocked: false,
          options: [
            {
              id: "step-1",
              description: "Act.",
              goalFit: 0.8,
              confidence: 0.8,
              risk: 0.1,
              authorized: true,
            },
          ],
        };
      },
      async observe() {
        return {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          source: "test",
          data: {},
        };
      },
      async evaluate() {
        cycle += 1;
        // Score converges toward 0.85 after cycle 1
        const score = cycle === 1 ? 0.5 : 0.85 + (cycle * 0.001);
        return {
          success: false,
          completed: false,
          score,
          explanation: "Converging.",
          discrepancies: ["Not quite done."],
        };
      },
      async reflect() {
        return {
          summary: "Converging.",
          lessons: [],
          continueTask: true,
          reason: "Almost there.",
        };
      },
    };

    const orchestrator = new MultiCycleOrchestrator(deps, {
      maxCycles: 10,
      convergenceThreshold: 0.05,
      noProgressThreshold: 10,
    });

    const result = await orchestrator.run({
      goal: "Converging goal.",
      maxCycles: 10,
    });

    expect(result.terminationReason).toBe("convergence-reached");
    expect(result.status).toBe("completed");
  });

  it("tracks sub-goals and marks them completed", async () => {
    const orchestrator = new MultiCycleOrchestrator(
      makeSuccessDeps(),
    );

    const result = await orchestrator.run({
      goal: "Goal with sub-goals.",
      subGoals: [
        {
          id: "sub-1",
          parentGoalId: "goal-1",
          description: "Sub-goal 1",
          order: 1,
          completed: false,
        },
        {
          id: "sub-2",
          parentGoalId: "goal-1",
          description: "Sub-goal 2",
          order: 2,
          completed: false,
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.subGoals).toHaveLength(2);
    expect(
      result.subGoals.every((sg) => sg.completed),
    ).toBe(true);
  });

  it("tracks progress history", async () => {
    let cycle = 0;

    const deps: PipelineDependencies = {
      async reason() {
        return {
          conclusion: "Attempting.",
          confidence: 0.5,
          reasoningSteps: [],
        };
      },
      async plan() {
        return {
          goal: "test",
          rationale: "Plan.",
          steps: [{ id: "step-1", description: "Act.", order: 1 }],
        };
      },
      async decide() {
        return {
          selectedOptionId: "step-1",
          rationale: "Only option.",
          confidence: 0.5,
          requiresAuthorization: false,
          blocked: false,
          options: [
            {
              id: "step-1",
              description: "Act.",
              goalFit: 0.5,
              confidence: 0.5,
              risk: 0.2,
              authorized: true,
            },
          ],
        };
      },
      async observe() {
        return {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          source: "test",
          data: {},
        };
      },
      async evaluate() {
        cycle += 1;
        const completed = cycle >= 3;
        return {
          success: completed,
          completed,
          score: cycle * 0.33,
          explanation: "Progressing.",
          discrepancies: completed ? [] : ["Not done."],
        };
      },
      async reflect() {
        return {
          summary: "Progressing.",
          lessons: [],
          continueTask: true,
          reason: "Not complete.",
        };
      },
    };

    const orchestrator = new MultiCycleOrchestrator(deps, {
      maxCycles: 5,
    });

    const result = await orchestrator.run({
      goal: "Progressing goal.",
      maxCycles: 5,
    });

    expect(result.progressHistory.length).toBeGreaterThan(0);
    expect(result.progressHistory[0]?.cycle).toBe(1);
  });

  it("throws OrchestrationError for empty goal", async () => {
    const orchestrator = new MultiCycleOrchestrator(
      makeSuccessDeps(),
    );

    await expect(
      orchestrator.run({ goal: "   " }),
    ).rejects.toThrow("Orchestration goal cannot be empty.");
  });

  it("wraps pipeline errors with orchestration context", async () => {
    const deps: PipelineDependencies = {
      async reason() {
        throw new Error("model unavailable");
      },
      async plan() { throw new Error("unreachable"); },
      async decide() { throw new Error("unreachable"); },
      async observe() { throw new Error("unreachable"); },
      async evaluate() { throw new Error("unreachable"); },
      async reflect() { throw new Error("unreachable"); },
    };

    const orchestrator = new MultiCycleOrchestrator(deps);

    await expect(
      orchestrator.run({ goal: "test" }),
    ).rejects.toThrow(
      "KAIROS multi-cycle orchestration failed during cycle 1.",
    );
  });
});