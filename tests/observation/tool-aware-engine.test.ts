import { describe, expect, it } from "vitest";
import { ToolAwareObservationEngine } from "../../src/core/observation/tool-aware-engine.js";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolPolicy } from "../../src/core/tools/policy.js";
import { ToolGateway } from "../../src/core/tools/gateway.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import type { Decision } from "../../src/core/decision/types.js";

function makeGateway(): ToolGateway {
  const registry = new ToolRegistry();
  registry.register(calculatorTool);
  const policy = new ToolPolicy({ actorPermissions: ["public"], maxRisk: "low" });
  return new ToolGateway(registry, policy);
}

describe("ToolAwareObservationEngine", () => {
  it("invokes the real tool when the selected option carries a toolCall", async () => {
    const gateway = makeGateway();
    const engine = new ToolAwareObservationEngine(gateway);

    const decision: Decision = {
      selectedOptionId: "opt-1",
      rationale: "test",
      confidence: 1,
      requiresAuthorization: false,
      blocked: false,
      options: [
        {
          id: "opt-1",
          description: "Calculate 2 + 2",
          goalFit: 1,
          confidence: 1,
          risk: 0,
          authorized: true,
          toolCall: { toolId: "kairos.calculator", parameters: { expression: "2 + 2" } },
        },
      ],
    };

    const observation = await engine.observeDecision(decision);
    expect(observation.source).toBe("tool-execution");
    expect(observation.data["toolId"]).toBe("kairos.calculator");

    const toolOutput = observation.data["toolOutput"] as { status: string; result?: unknown };
    expect(toolOutput.status).toBe("success");
    expect((toolOutput.result as { result: number }).result).toBe(4);

    const actualOutcome = observation.data["actualOutcome"] as { status: string };
    expect(actualOutcome.status).toBe("completed");
  });

  it("falls back to basic observation when no toolCall is present", async () => {
    const gateway = makeGateway();
    const engine = new ToolAwareObservationEngine(gateway);

    const decision: Decision = {
      selectedOptionId: "opt-1",
      rationale: "test",
      confidence: 1,
      requiresAuthorization: false,
      blocked: false,
      options: [
        {
          id: "opt-1",
          description: "No tool needed",
          goalFit: 1,
          confidence: 1,
          risk: 0,
          authorized: true,
        },
      ],
    };

    const observation = await engine.observeDecision(decision);
    expect(observation.source).toBe("action-execution");
  });

  it("reports a failed outcome when the tool gateway blocks the call", async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const restrictivePolicy = new ToolPolicy({ actorPermissions: [], maxRisk: "none" });
    const gateway = new ToolGateway(registry, restrictivePolicy);
    const engine = new ToolAwareObservationEngine(gateway);

    const decision: Decision = {
      selectedOptionId: "opt-1",
      rationale: "test",
      confidence: 1,
      requiresAuthorization: false,
      blocked: false,
      options: [
        {
          id: "opt-1",
          description: "Calculate 2 + 2",
          goalFit: 1,
          confidence: 1,
          risk: 0,
          authorized: true,
          toolCall: { toolId: "kairos.calculator", parameters: { expression: "2 + 2" } },
        },
      ],
    };

    const observation = await engine.observeDecision(decision);
    const toolOutput = observation.data["toolOutput"] as { status: string };
    expect(toolOutput.status).toBe("blocked");

    const actualOutcome = observation.data["actualOutcome"] as { status: string };
    expect(actualOutcome.status).toBe("failed");
  });
});