import { describe, expect, it } from "vitest";
import { MultiCycleOrchestrator } from "../../src/core/orchestrator/multi-cycle-orchestrator.js";
import { SessionOrchestrator } from "../../src/core/orchestrator/session-orchestrator.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import type { PipelineDependencies } from "../../src/core/orchestrator/pipeline.js";

function makeNeverCompleteDeps(): PipelineDependencies {
  const base = createPipelineDependencies({ mode: "basic" });
  return {
    ...base,
    evaluate: async () => ({
      success: false,
      score: 0,
      explanation: "never done",
      discrepancies: [],
      completed: false,
    }),
  };
}

describe("MultiCycleOrchestrator — timeout", () => {
  it("terminates with timeout when deadline exceeded before first cycle", async () => {
    const orchestrator = new MultiCycleOrchestrator(makeNeverCompleteDeps(), {
      maxCycles: 100, convergenceThreshold: 0.01, noProgressThreshold: 99, timeoutMs: 1,
    });
    await new Promise((r) => setTimeout(r, 10));
    const result = await orchestrator.run({ goal: "test timeout" });
    expect(result.terminationReason).toBe("timeout");
    expect(result.status).toBe("failed");
  });
});

describe("MultiCycleOrchestrator — cancellation", () => {
  it("terminates with cancelled when cancel() is called before run()", async () => {
    const orchestrator = new MultiCycleOrchestrator(makeNeverCompleteDeps(), {
      maxCycles: 100, convergenceThreshold: 0.01, noProgressThreshold: 99,
    });
    orchestrator.cancel();
    const result = await orchestrator.run({ goal: "test cancellation" });
    expect(result.terminationReason).toBe("cancelled");
    expect(result.status).toBe("failed");
  });
});

describe("SessionOrchestrator — cancellation", () => {
  it("exposes cancel() that delegates to inner orchestrator", async () => {
    const session = new SessionOrchestrator(makeNeverCompleteDeps(), { maxCycles: 100, noProgressThreshold: 99 });
    session.cancel();
    const result = await session.run("test session cancel");
    expect(result.terminationReason).toBe("cancelled");
    expect(result.status).toBe("failed");
  });
});
