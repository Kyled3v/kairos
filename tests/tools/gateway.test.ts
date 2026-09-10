import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolPolicy } from "../../src/core/tools/policy.js";
import { ToolGateway } from "../../src/core/tools/gateway.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import { mockFileWriteTool } from "../../src/core/tools/built-in/mock-file-write.js";
import { mockFileReadTool } from "../../src/core/tools/built-in/mock-file-read.js";

function makeGateway(maxRisk: "none" | "low" | "medium" | "high" | "critical" = "low") {
  const registry = new ToolRegistry();
  registry.register(calculatorTool);
  registry.register(mockFileReadTool);
  registry.register(mockFileWriteTool);
  const policy = new ToolPolicy({ actorPermissions: ["public", "restricted"], maxRisk });
  return new ToolGateway(registry, policy);
}

describe("ToolGateway", () => {
  it("executes an allowed tool", async () => {
    const gateway = makeGateway();
    const result = await gateway.execute("kairos", {
      toolId: "kairos.calculator",
      parameters: { expression: "10 * 5" },
      requestedBy: "kairos",
      requestId: "req-1",
    });
    expect(result.status).toBe("success");
    expect((result.result as { result: number }).result).toBe(50);
  });

  it("blocks a tool that exceeds actor risk tolerance", async () => {
    const gateway = makeGateway("low");
    const result = await gateway.execute("kairos", {
      toolId: "kairos.mock-file-write",
      parameters: { path: "/test", content: "hello" },
      requestedBy: "kairos",
      requestId: "req-2",
    });
    expect(result.status).toBe("blocked");
    expect(result.error).toContain("risk level");
  });

  it("blocks a tool the actor lacks permission for", async () => {
    const registry = new ToolRegistry();
    registry.register(mockFileWriteTool);
    const policy = new ToolPolicy({ actorPermissions: ["public"], maxRisk: "critical" });
    const gateway = new ToolGateway(registry, policy);
    const result = await gateway.execute("kairos", {
      toolId: "kairos.mock-file-write",
      parameters: { path: "/test", content: "hello" },
      requestedBy: "kairos",
      requestId: "req-3",
    });
    expect(result.status).toBe("blocked");
    expect(result.error).toContain("lacks permission");
  });

  it("returns failure for an unregistered tool", async () => {
    const gateway = makeGateway();
    const result = await gateway.execute("kairos", {
      toolId: "kairos.unknown",
      parameters: {},
      requestedBy: "kairos",
      requestId: "req-4",
    });
    expect(result.status).toBe("failure");
    expect(result.error).toContain("not registered");
  });
});
