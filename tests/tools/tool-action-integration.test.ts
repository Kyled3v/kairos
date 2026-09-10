import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolPolicy } from "../../src/core/tools/policy.js";
import { ToolGateway } from "../../src/core/tools/gateway.js";
import { ToolActionExecutor } from "../../src/core/action/tool-action-executor.js";
import { AuthorizedActionGateway } from "../../src/security/authorization/gateway.js";
import { BasicAuthorizationEngine } from "../../src/security/authorization/basic-engine.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";

describe("ToolActionExecutor integration", () => {
  function makeExecutor() {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const policy = new ToolPolicy({ actorPermissions: ["public"], maxRisk: "low" });
    const toolGateway = new ToolGateway(registry, policy);
    return new ToolActionExecutor(toolGateway);
  }

  it("executes an allowed tool via ActionExecutor interface", async () => {
    const executor = makeExecutor();
    const result = await executor.execute({
      id: "action-1",
      name: "kairos.calculator",
      description: "Calculate something.",
      parameters: { expression: "7 + 3" },
      requestedBy: "kairos",
    });
    expect(result.status).toBe("completed");
    expect((result.output as { result: number }).result).toBe(10);
  });

  it("returns failed for an unregistered tool", async () => {
    const executor = makeExecutor();
    const result = await executor.execute({
      id: "action-2",
      name: "kairos.nonexistent",
      description: "Does not exist.",
      parameters: {},
      requestedBy: "kairos",
    });
    expect(result.status).toBe("failed");
  });

  it("blocks unauthorized actions via AuthorizedActionGateway", async () => {
    const executor = makeExecutor();
    const authEngine = new BasicAuthorizationEngine();
    const gateway = new AuthorizedActionGateway(authEngine, executor);
    const result = await gateway.execute("kairos", {
      id: "action-3",
      name: "delete-production-database",
      description: "Denied by auth engine.",
      parameters: {},
      requestedBy: "kairos",
    });
    expect(result.status).toBe("blocked");
  });
});
