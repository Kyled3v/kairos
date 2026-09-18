/**
 * KAIROS Evaluation — Planning benchmark
 *
 * Constitution section 9: "Claims of improvement must be supported by
 * measurable evaluation." This suite scores the planning pipeline and
 * goal decomposition against explicit, reproducible checks:
 *
 *   P1  Basic engine plans for every goal and always returns a plan
 *   P2  Basic engine plans are deterministic (same input → same output)
 *   P3  Plans are internally consistent: ordered steps, tied to the goal
 *   P4  Basic result structure satisfies the Plan contract
 *   P5  Model engine parses valid JSON plans through the router
 *   P6  Model engine falls back deterministically on invalid model output
 *   P7  BasicGoalDecomposer produces ordered, parent-linked sub-goals
 *   P8  Smart decomposition routes clauses to role-matched workers
 *
 * Run with: npm test -- evals/planning
 */
import { describe, expect, it } from "vitest";
import { BasicPlanningEngine } from "../../src/core/planning/basic-engine.js";
import { ModelPlanningEngine } from "../../src/intelligence/planning/model-planning-engine.js";
import { BasicGoalDecomposer } from "../../src/core/goals/basic-decomposer.js";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { createSmartStrategy } from "../../src/agents/executive/decomposition.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../../src/intelligence/models/types.js";
import type { DelegatableAgent } from "../../src/agents/tool-boundary.js";
import type { ReasoningResult } from "../../src/core/reasoning/types.js";

const reasoning: ReasoningResult = {
  conclusion: "Goal is achievable with the registered tools.",
  confidence: 0.8,
  reasoningSteps: ["Reviewed the goal.", "Checked constraints."],
};

const GOALS: readonly string[] = [
  "Refactor the memory subsystem",
  "Ship the observation dashboard",
  "",
];

/** Scriptable provider returning canned content — used to test JSON parsing. */
class ScriptedProvider implements ModelProvider {
  readonly id = "scripted";
  readonly name = "Scripted Provider";

  constructor(private readonly content: string) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    return {
      content: this.content,
      model: request.model,
      provider: this.id,
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      finishReason: "stop",
    };
  }
}

function fakeWorker(id: string, role: string): DelegatableAgent {
  const identity = {
    id,
    name: id,
    metadata: { role },
    createdAt: new Date(),
  } as DelegatableAgent["identity"];
  return {
    identity,
    run: async () => {
      throw new Error("fake worker must not execute");
    },
  };
}

describe("KAIROS Evaluation — planning benchmark (Constitution §9)", () => {
  it("P1: the basic engine plans for every goal and always returns a plan", async () => {
    const engine = new BasicPlanningEngine();
    for (const goal of GOALS) {
      const plan = await engine.plan({ goal, reasoning });
      expect(plan.goal).toBe(goal);
      expect(plan.steps.length).toBeGreaterThan(0);
    }
  });

  it("P2: the basic engine is deterministic — same input, same output", async () => {
    const engine = new BasicPlanningEngine();
    const context = { goal: "Coordinate the release", reasoning };

    const first = await engine.plan(context);
    const second = await engine.plan(context);

    expect(second).toEqual(first);
  });

  it("P3: plans are internally consistent — ordered steps tied to the goal", async () => {
    const engine = new BasicPlanningEngine();
    const goal = "Sequence the migration steps";
    const plan = await engine.plan({ goal, reasoning });

    expect(plan.goal).toBe(goal);
    expect(plan.rationale.length).toBeGreaterThan(0);

    const orders = plan.steps.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(new Set(plan.steps.map((s) => s.id)).size).toBe(plan.steps.length);
    for (const step of plan.steps) {
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it("P4: the result satisfies the Plan contract shape", async () => {
    const engine = new BasicPlanningEngine();
    const plan = await engine.plan({ goal: "any", reasoning });

    expect(Object.keys(plan).sort()).toEqual(["goal", "rationale", "steps"].sort());
    for (const step of plan.steps) {
      expect(Object.keys(step).sort()).toEqual(["description", "id", "order"].sort());
    }
  });

  it("P5: the model engine parses valid JSON plans through the router", async () => {
    const router = new ModelRouter();
    router.register(
      new ScriptedProvider(
        JSON.stringify({
          rationale: "Sequenced by dependency order.",
          steps: [
            { id: "a", description: "Inspect current schema", order: 1 },
            { id: "b", description: "Apply backfill", order: 2 },
          ],
        }),
      ),
    );
    const engine = new ModelPlanningEngine(router, {
      providerId: "scripted",
      modelId: "planner",
    });

    const plan = await engine.plan({ goal: "Migrate the store", reasoning });
    expect(plan.rationale).toBe("Sequenced by dependency order.");
    expect(plan.steps.map((s) => s.id)).toEqual(["a", "b"]);
    expect(plan.goal).toBe("Migrate the store");
  });

  it("P6: the model engine falls back deterministically on invalid output", async () => {
    const router = new ModelRouter();
    router.register(new ScriptedProvider("this is not JSON at all"));
    const engine = new ModelPlanningEngine(router, {
      providerId: "scripted",
      modelId: "planner",
    });

    const plan = await engine.plan({ goal: "Do the thing", reasoning });
    // Fallback keeps the plan well-formed rather than throwing.
    expect(plan.goal).toBe("Do the thing");
    expect(plan.steps.length).toBeGreaterThan(0);
    const orders = plan.steps.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("P7: the basic decomposer produces ordered, parent-linked sub-goals", async () => {
    const decomposer = new BasicGoalDecomposer();
    const decomposition = await decomposer.decompose({
      id: "goal-1",
      description: "Deliver the audit trail",
      priority: 1,
      createdAt: new Date(),
    });

    expect(decomposition.goalId).toBe("goal-1");
    expect(decomposition.subGoals.length).toBe(3);

    const orders = decomposition.subGoals.map((sg) => sg.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    for (const sub of decomposition.subGoals) {
      expect(sub.parentGoalId).toBe("goal-1");
      expect(sub.description.length).toBeGreaterThan(0);
    }
  });

  it("P8: smart decomposition routes clauses to role-matched workers", () => {
    const workers = [
      fakeWorker("orion", "research"),
      fakeWorker("forge", "engineering"),
      fakeWorker("sage", "knowledge"),
    ];
    const strategy = createSmartStrategy(workers);

    const tasks = strategy("Research the bug; then implement the fix; then document it");

    expect(tasks.map((t) => t.workerId)).toEqual(["orion", "forge", "sage"]);
    expect(tasks[0]?.goal).toBe("Research the bug");
    expect(tasks[1]?.goal).toBe("implement the fix");
    expect(tasks[2]?.goal).toBe("document it");
  });
});
