import { describe, expect, it } from "vitest";
import { BasicKairosRuntime } from "../../src/core/runtime/basic-runtime.js";

describe("BasicKairosRuntime", () => {
  it("executes the complete cognitive pipeline", async () => {
    const runtime = new BasicKairosRuntime();

    const result = await runtime.execute(
      "Create a safe plan for understanding Nexus requirements",
    );

    expect(result.goal).toContain("Nexus");
    expect(result.currentState).toBe("COMPLETE");
    expect(result.reasoning).toBeDefined();
    expect(result.plan).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(result.authorization).toBeDefined();
    expect(result.action).toBeDefined();
    expect(result.observation).toBeDefined();
    expect(result.evaluation).toBeDefined();
    expect(result.reflection).toBeDefined();
    expect(result.completed).toBe(true);
    expect(result.terminationReason).toBe("Objective completed.");
  });
});
