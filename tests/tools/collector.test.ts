import { describe, expect, it } from "vitest";
import { ToolCallCollector } from "../../src/core/tools/collector.js";
import type { ToolOutput } from "../../src/core/tools/types.js";

function makeOutput(status: ToolOutput["status"]): ToolOutput {
  return {
    toolId: "kairos.calculator",
    requestId: "req-1",
    status,
    result: 42,
    executedAt: new Date(),
    durationMs: 5,
  };
}

describe("ToolCallCollector", () => {
  it("starts empty", () => {
    const c = new ToolCallCollector();
    expect(c.size).toBe(0);
    expect(c.drain()).toHaveLength(0);
  });

  it("records a successful tool call", () => {
    const c = new ToolCallCollector();
    c.record({
      toolId: "kairos.calculator",
      requestId: "req-1",
      parameters: { expression: "1+1" },
      output: makeOutput("success"),
      executedAt: new Date(),
    });
    expect(c.size).toBe(1);
    const records = c.drain();
    expect(records[0]?.status).toBe("success");
    expect(records[0]?.toolId).toBe("kairos.calculator");
  });

  it("records multiple calls", () => {
    const c = new ToolCallCollector();
    for (let i = 0; i < 3; i++) {
      c.record({
        toolId: "kairos.calculator",
        requestId: `req-${i}`,
        parameters: {},
        output: makeOutput("success"),
        executedAt: new Date(),
      });
    }
    expect(c.size).toBe(3);
    expect(c.drain()).toHaveLength(3);
  });

  it("drain returns a snapshot — collector retains records", () => {
    const c = new ToolCallCollector();
    c.record({
      toolId: "kairos.calculator",
      requestId: "req-1",
      parameters: {},
      output: makeOutput("failure"),
      executedAt: new Date(),
    });
    const first = c.drain();
    const second = c.drain();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});