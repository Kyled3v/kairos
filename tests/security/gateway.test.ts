import { describe, expect, it } from "vitest";
import { BasicActionExecutor } from "../../src/core/action/basic-executor.js";
import { BasicAuthorizationEngine } from "../../src/security/authorization/basic-engine.js";
import { AuthorizedActionGateway } from "../../src/security/authorization/gateway.js";

describe("AuthorizedActionGateway", () => {
  it("allows authorized actions to reach the executor", async () => {
    const gateway = new AuthorizedActionGateway(
      new BasicAuthorizationEngine(),
      new BasicActionExecutor(),
    );

    const result = await gateway.execute("kairos", {
      id: "action-1",
      name: "create-plan",
      description: "Create a plan.",
      parameters: {},
      requestedBy: "kairos",
    });

    expect(result.status).toBe("completed");
  });

  it("blocks unauthorized actions before execution", async () => {
    const gateway = new AuthorizedActionGateway(
      new BasicAuthorizationEngine(),
      new BasicActionExecutor(),
    );

    const result = await gateway.execute("kairos", {
      id: "action-2",
      name: "delete-production-database",
      description: "Delete a production database.",
      parameters: {},
      requestedBy: "kairos",
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("not permitted");
  });
});
