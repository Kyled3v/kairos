import { describe, expect, it } from "vitest";
import { BasicDecisionEngine } from "../../src/core/decision/engine/basic-engine.js";
import { ToolAwareDecisionEngine } from "../../src/core/decision/engine/tool-aware-engine.js";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolSelectionPolicy } from "../../src/core/tools/selection-policy.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import type { DecisionOption } from "../../src/core/decision/types.js";

const plan = {
  goal: "Calculate costs",
  rationale: "Need arithmetic.",
  steps: [
    { id: "step-1", description: "Calculate the total arithmetic sum.", order: 1 },
    { id: "step-2", description: "Review the results.", order: 2 },
  ],
};

describe("ToolAwareDecisionEngine", () => {
  it("attaches a toolCall to options that match a tool", async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.2 });
    const engine = new ToolAwareDecisionEngine(new BasicDecisionEngine(), policy);

    const result = await engine.decide({ goal: "Calculate costs", plan, authorized: true });

    const step1 = result.options.find((o: DecisionOption) => o.id === "step-1");
    expect(step1?.toolCall).toBeDefined();
    expect(step1?.toolCall?.toolId).toBe("kairos.calculator");
  });

  it("leaves options without a match unchanged", async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.9 });
    const engine = new ToolAwareDecisionEngine(new BasicDecisionEngine(), policy);

    const result = await engine.decide({ goal: "Calculate costs", plan, authorized: true });

    for (const option of result.options) {
      expect(option.toolCall).toBeUndefined();
    }
  });

  it("preserves the inner engine decision logic", async () => {
    const registry = new ToolRegistry();
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.99 });
    const engine = new ToolAwareDecisionEngine(new BasicDecisionEngine(), policy);

    const result = await engine.decide({ goal: "test", plan, authorized: false });
    expect(result.blocked).toBe(true);
    expect(result.requiresAuthorization).toBe(true);
  });
});
