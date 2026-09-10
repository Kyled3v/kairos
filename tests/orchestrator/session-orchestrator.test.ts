import { describe, expect, it } from "vitest";
import { SessionOrchestrator } from "../../src/core/orchestrator/session-orchestrator.js";
import { BasicReasoningEngine } from "../../src/core/reasoning/engine/basic-engine.js";
import { BasicPlanningEngine } from "../../src/core/planning/basic-engine.js";
import { BasicDecisionEngine } from "../../src/core/decision/engine/basic-engine.js";
import { BasicObservationEngine } from "../../src/core/observation/basic-engine.js";
import { BasicEvaluationEngine } from "../../src/core/evaluation/basic-engine.js";
import { BasicReflectionEngine } from "../../src/core/reflection/basic-engine.js";
import { BasicGoalDecomposer } from "../../src/core/goals/basic-decomposer.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { ToolCallCollector } from "../../src/core/tools/collector.js";
import type { PipelineDependencies } from "../../src/core/orchestrator/pipeline.js";

function makeDependencies(): PipelineDependencies {
  const reasoning = new BasicReasoningEngine();
  const planning = new BasicPlanningEngine();
  const decision = new BasicDecisionEngine();
  const observation = new BasicObservationEngine();
  const evaluation = new BasicEvaluationEngine();
  const reflection = new BasicReflectionEngine();

  return {
    reason: (g) => reasoning.reason({ goal: g, observations: [], constraints: [] }),
    plan: (g, r) => planning.plan({ goal: g, reasoning: r }),
    decide: (g, p) => decision.decide({ goal: g, plan: p, authorized: true }),
    observe: (_g, d) =>
      observation.observe({ actionId: d.selectedOptionId ?? "unknown", actualOutcome: { status: "completed" } }),
    evaluate: (g, o) => evaluation.evaluate({ goal: g, observation: o }),
    reflect: (g, e) => reflection.reflect({ goal: g, evaluation: e }),
  };
}

describe("SessionOrchestrator", () => {
  it("runs a session and returns a result", async () => {
    const deps = makeDependencies();
    const session = new SessionOrchestrator(deps, { maxCycles: 3 });
    const result = await session.run("test goal");
    expect(result.goal).toBe("test goal");
    expect(result.totalCycles).toBeGreaterThan(0);
  });

  it("saves experience record when store is wired", async () => {
    const deps = makeDependencies();
    const store = new InMemoryExperienceStore();
    const session = new SessionOrchestrator(
      deps,
      { maxCycles: 2, sessionId: "sess-1" },
      undefined,
      store,
    );
    await session.run("remember this");
    const count = await store.count();
    expect(count).toBe(1);
    const records = await store.query({});
    expect(records[0]?.goal).toBe("remember this");
    expect(records[0]?.sessionId).toBe("sess-1");
  });

  it("decomposes goal into sub-goals when decomposer is wired", async () => {
    const deps = makeDependencies();
    const decomposer = new BasicGoalDecomposer();
    const session = new SessionOrchestrator(deps, { maxCycles: 2 }, decomposer);
    const result = await session.run("build a feature");
    expect(result.subGoals.length).toBeGreaterThan(0);
  });

  it("includes tool call records from collector", async () => {
    const deps = makeDependencies();
    const store = new InMemoryExperienceStore();
    const collector = new ToolCallCollector();
    const session = new SessionOrchestrator(
      deps,
      { maxCycles: 1, sessionId: "sess-2" },
      undefined,
      store,
      collector,
    );
    await session.run("tool test");
    const records = await store.query({});
    // toolCalls array exists (may be empty since basic deps don't invoke tools)
    expect(Array.isArray(records[0]?.toolCalls)).toBe(true);
  });
});