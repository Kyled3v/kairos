import { describe, expect, it } from "vitest";
import { BasicObservationEngine } from "../../src/core/observation/basic-engine.js";

describe("BasicObservationEngine", () => {
  it("records an observable action outcome", async () => {
    const engine = new BasicObservationEngine();

    const result = await engine.observe({
      actionId: "action-1",
      expectedOutcome: { status: "completed" },
      actualOutcome: { status: "completed" },
    });

    expect(result.id).toBeTypeOf("string");
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.source).toBe("action-execution");
    expect(result.data.actionId).toBe("action-1");
  });
});
