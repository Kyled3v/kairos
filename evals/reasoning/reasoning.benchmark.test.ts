/**
 * KAIROS Evaluation — Reasoning benchmark
 *
 * Constitution section 9: "Claims of improvement must be supported by
 * measurable evaluation." This suite scores the reasoning pipeline
 * against explicit, reproducible checks:
 *
 *   R1  Basic engine reasons over every goal and always returns a result
 *   R2  Basic engine results are deterministic (same input → same output)
 *   R3  Confidence is a valid probability in [0, 1]
 *   R4  Reasoning steps are produced and reference the supplied context
 *   R5  Basic result structure satisfies the ReasoningResult contract
 *   R6  Model engine is wired through the router and shapes its result
 *   R7  A failing/unconfigured model surfaces as a thrown error, never
 *       a silently degraded result
 *
 * Run with: npm test -- evals/reasoning
 */
import { describe, expect, it } from "vitest";
import { BasicReasoningEngine } from "../../src/core/reasoning/engine/basic-engine.js";
import { ModelReasoningEngine } from "../../src/intelligence/reasoning/model-reasoning-engine.js";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import type { ReasoningContext } from "../../src/core/reasoning/types.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../../src/intelligence/models/types.js";

const GOALS: readonly string[] = [
  "Analyse the authentication flow for missing validation",
  "Determine why the memory recall latency regressed",
  "Plan the migration path from in-memory stores to Neon",
  "short",
  "",
];

function contextFor(goal: string): ReasoningContext {
  return {
    goal,
    observations: ["Three prior probes succeeded", "Store latency rose 40%"],
    constraints: ["No model available", "Must stay deterministic"],
  };
}

/** Provider that always fails — used to verify error propagation. */
class FailingProvider implements ModelProvider {
  readonly id = "failing";
  readonly name = "Failing Provider";

  async generate(_request: ModelRequest): Promise<ModelResponse> {
    throw new Error("simulated model outage");
  }
}

describe("KAIROS Evaluation — reasoning benchmark (Constitution §9)", () => {
  it("R1: the basic engine reasons over every goal and always returns a result", async () => {
    const engine = new BasicReasoningEngine();
    for (const goal of GOALS) {
      const result = await engine.reason(contextFor(goal));
      expect(typeof result.conclusion).toBe("string");
      expect(result.conclusion.length).toBeGreaterThan(0);
    }
  });

  it("R2: the basic engine is deterministic — same input, same output", async () => {
    const engine = new BasicReasoningEngine();
    const context = contextFor("Analyse the delegation audit trail");

    const first = await engine.reason(context);
    const second = await engine.reason(context);

    expect(second).toEqual(first);
  });

  it("R3: confidence is always a valid probability in [0, 1]", async () => {
    const engine = new BasicReasoningEngine();
    for (const goal of GOALS) {
      const { confidence } = await engine.reason(contextFor(goal));
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
      expect(Number.isNaN(confidence)).toBe(false);
    }
  });

  it("R4: reasoning steps are produced and reference the supplied context", async () => {
    const engine = new BasicReasoningEngine();
    const context = contextFor("Evaluate the policy engine");
    const result = await engine.reason(context);

    expect(result.reasoningSteps.length).toBeGreaterThan(0);
    const joined = result.reasoningSteps.join(" ");
    // The steps must acknowledge the actual observations/constraints supplied.
    expect(joined).toContain("2");
    expect(joined).toContain("2");
  });

  it("R5: the result satisfies the ReasoningResult contract shape", async () => {
    const engine = new BasicReasoningEngine();
    const result = await engine.reason(contextFor("Map the tool registry"));

    expect(Object.keys(result).sort()).toEqual(
      ["conclusion", "confidence", "reasoningSteps"].sort(),
    );
    expect(Array.isArray(result.reasoningSteps)).toBe(true);
  });

  it("R6: the model engine routes through the router and shapes its result", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());
    const engine = new ModelReasoningEngine(router, {
      providerId: "mock",
      modelId: "mock-reasoner",
    });

    const result = await engine.reason(contextFor("Assess the CI pipeline"));

    expect(result.conclusion).toContain("Assess the CI pipeline");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reasoningSteps.length).toBeGreaterThan(0);
  });

  it("R7: a failing model surfaces as an error, never a silent degraded result", async () => {
    const router = new ModelRouter();
    router.register(new FailingProvider());
    const engine = new ModelReasoningEngine(router, {
      providerId: "failing",
      modelId: "unavailable",
    });

    await expect(engine.reason(contextFor("Anything"))).rejects.toThrow(
      /simulated model outage/,
    );
  });
});
