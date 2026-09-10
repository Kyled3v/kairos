import { describe, expect, it } from "vitest";
import { recordFromMultiCycleResult } from "../../src/core/experience/recorder.js";
import type { MultiCycleResult } from "../../src/core/orchestrator/types.js";

function makeResult(overrides: Partial<MultiCycleResult> = {}): MultiCycleResult {
  const now = new Date();
  return { goal: "Test goal", status: "completed", terminationReason: "objective-completed", totalCycles: 1, cycleHistory: [], progressHistory: [], subGoals: [], startedAt: now, completedAt: now, ...overrides };
}

describe("recordFromMultiCycleResult", () => {
  it("creates success record for completed result", () => {
    const result = makeResult({ status: "completed" });
    const record = recordFromMultiCycleResult(result, { sessionId: "s1" }, result.startedAt);
    expect(record.outcome).toBe("success");
    expect(record.goal).toBe("Test goal");
    expect(record.sessionId).toBe("s1");
  });
  it("creates failure record for failed result", () => {
    const result = makeResult({ status: "failed", terminationReason: "no-progress-detected" });
    const record = recordFromMultiCycleResult(result, { sessionId: "s1" }, result.startedAt);
    expect(record.outcome).toBe("failure");
    expect(record.metadata["terminationReason"]).toBe("no-progress-detected");
  });
  it("includes model provider and id", () => {
    const result = makeResult();
    const record = recordFromMultiCycleResult(result, { sessionId: "s1", modelProvider: "anthropic", modelId: "claude-3" }, result.startedAt);
    expect(record.modelProvider).toBe("anthropic");
    expect(record.modelId).toBe("claude-3");
  });
  it("includes tool calls", () => {
    const result = makeResult();
    const toolCalls = [{ toolId: "kairos.calculator", requestId: "r1", parameters: {}, status: "success" as const, executedAt: new Date(), durationMs: 5 }];
    const record = recordFromMultiCycleResult(result, { sessionId: "s1" }, result.startedAt, toolCalls);
    expect(record.toolCalls).toHaveLength(1);
  });
});
