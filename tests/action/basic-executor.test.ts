import { describe, expect, it } from "vitest";
import { BasicActionExecutor } from "../../src/core/action/basic-executor.js";

describe("BasicActionExecutor", () => {
  it("creates a safe simulated action result", async () => {
    const executor = new BasicActionExecutor();

    const result = await executor.execute({
      id: "action-1",
      name: "create-plan",
      description: "Create a plan for the requested objective.",
      parameters: {
        objective: "Build Nexus",
      },
      requestedBy: "kairos",
    });

    expect(result.actionId).toBe("action-1");
    expect(result.status).toBe("completed");
    expect(result.output).toEqual({
      simulated: true,
      action: "create-plan",
      parameters: {
        objective: "Build Nexus",
      },
    });
  });
});
