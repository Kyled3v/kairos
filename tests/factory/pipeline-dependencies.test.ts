import { describe, expect, it } from "vitest";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolPolicy } from "../../src/core/tools/policy.js";
import { ToolGateway } from "../../src/core/tools/gateway.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import { executePipeline } from "../../src/core/orchestrator/pipeline.js";

describe("createPipelineDependencies", () => {
  it("builds working basic-mode dependencies", async () => {
    const deps = createPipelineDependencies({ mode: "basic" });
    const result = await executePipeline("basic goal", deps, { cycle: 1 });
    expect(result.reasoning.conclusion).toContain("basic goal");
    expect(result.evaluation).toBeDefined();
  });

  it("builds working model-mode dependencies against a mock provider", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());
    const deps = createPipelineDependencies({
      mode: "model",
      router,
      providerId: "mock",
      modelId: "mock-model",
    });
    const result = await executePipeline("model goal", deps, { cycle: 1 });
    expect(result.reasoning.conclusion.length).toBeGreaterThan(0);
    expect(result.plan.steps.length).toBeGreaterThan(0);
  });

  it("wires a tool-aware observation stage when a toolGateway is supplied", async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const policy = new ToolPolicy({ actorPermissions: ["public"], maxRisk: "low" });
    const toolGateway = new ToolGateway(registry, policy);

    const deps = createPipelineDependencies({ mode: "basic", toolGateway });
    // BasicDecisionEngine never sets a toolCall today, so this should
    // still fall back cleanly to a standard observation without throwing.
    const result = await executePipeline("tool goal", deps, { cycle: 1 });
    expect(result.observation.source).toBe("action-execution");
  });
});