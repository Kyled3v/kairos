import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolExecutor } from "../../src/core/tools/executor.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";

describe("ToolExecutor", () => {
  it("executes a registered tool successfully", async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const executor = new ToolExecutor(registry);

    const result = await executor.execute({
      toolId: "kairos.calculator",
      parameters: { expression: "2 + 2" },
      requestedBy: "kairos",
      requestId: "req-1",
    });

    expect(result.status).toBe("success");
    expect((result.result as { result: number }).result).toBe(4);
  });

  it("returns failure for an unknown tool", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const result = await executor.execute({
      toolId: "kairos.nonexistent",
      parameters: {},
      requestedBy: "kairos",
      requestId: "req-2",
    });

    expect(result.status).toBe("failure");
    expect(result.error).toContain("Tool not found");
  });
});