import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolPolicy } from "../../src/core/tools/policy.js";
import { ToolGateway } from "../../src/core/tools/gateway.js";
import type { Tool, ToolInput, ToolOutput } from "../../src/core/tools/types.js";

const slowTool: Tool = {
  definition: {
    id: "kairos.slow-tool",
    name: "Slow Tool",
    description: "A tool that takes a long time.",
    version: "1.0.0",
    capabilities: ["compute"],
    permission: "public",
    risk: "none",
    inputSchema: {},
    outputSchema: {},
    enabled: true,
  },
  async execute(input: ToolInput): Promise<ToolOutput> {
    await new Promise((r) => setTimeout(r, 500));
    return { toolId: input.toolId, requestId: input.requestId, status: "success", executedAt: new Date(), durationMs: 500 };
  },
};

describe("ToolGateway timeout", () => {
  it("returns failure with timeout message when tool exceeds timeoutMs", async () => {
    const registry = new ToolRegistry();
    registry.register(slowTool);
    const policy = new ToolPolicy({ actorPermissions: ["public"], maxRisk: "low" });
    const gateway = new ToolGateway(registry, policy, { timeoutMs: 10 });
    const result = await gateway.execute("kairos", {
      toolId: "kairos.slow-tool",
      parameters: {},
      requestedBy: "kairos",
      requestId: "req-timeout",
    });
    expect(result.status).toBe("failure");
    expect(result.error).toContain("timed out");
  });
});