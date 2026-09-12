import { describe, expect, it } from "vitest";
import { ModelGoalDecomposer } from "../../src/core/goals/model-decomposer.js";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../../src/intelligence/models/types.js";

function makeGoal(description: string) {
  return { id: "g1", description, priority: 1, createdAt: new Date() };
}

function makeProvider(response: string): ModelProvider {
  return { id: "mock", name: "Mock",
    async generate(_req: ModelRequest): Promise<ModelResponse> {
      return { content: response, model: "mock-model", provider: "mock" };
    },
  };
}

const VALID_JSON = JSON.stringify([
  { description: "Research the topic", order: 1 },
  { description: "Write a plan", order: 2 },
]);

const FENCED_JSON = "```json\n" + JSON.stringify([{ description: "Step 1", order: 1 }]) + "\n```";

const MANY_JSON = JSON.stringify([
  { description: "S1", order: 1 }, { description: "S2", order: 2 },
  { description: "S3", order: 3 }, { description: "S4", order: 4 },
]);

describe("ModelGoalDecomposer", () => {
  it("parses valid JSON sub-goals from model response", async () => {
    const router = new ModelRouter();
    router.register(makeProvider(VALID_JSON));
    const d = new ModelGoalDecomposer({ router, providerId: "mock", modelId: "mock-model" });
    const result = await d.decompose(makeGoal("Build a todo app"));
    expect(result.subGoals).toHaveLength(2);
    expect(result.subGoals[0]?.description).toBe("Research the topic");
    expect(result.subGoals[0]?.parentGoalId).toBe("g1");
  });

  it("falls back to basic when model returns invalid JSON", async () => {
    const router = new ModelRouter();
    router.register(makeProvider("not json"));
    const d = new ModelGoalDecomposer({ router, providerId: "mock", modelId: "mock-model" });
    const result = await d.decompose(makeGoal("goal"));
    expect(result.subGoals.length).toBeGreaterThan(0);
    expect(result.goalId).toBe("g1");
  });

  it("respects maxSubGoals limit", async () => {
    const router = new ModelRouter();
    router.register(makeProvider(MANY_JSON));
    const d = new ModelGoalDecomposer({ router, providerId: "mock", modelId: "mock-model", maxSubGoals: 2 });
    const result = await d.decompose(makeGoal("Big goal"));
    expect(result.subGoals).toHaveLength(2);
  });

  it("strips markdown fences from model response", async () => {
    const router = new ModelRouter();
    router.register(makeProvider(FENCED_JSON));
    const d = new ModelGoalDecomposer({ router, providerId: "mock", modelId: "mock-model" });
    const result = await d.decompose(makeGoal("Goal"));
    expect(result.subGoals[0]?.description).toBe("Step 1");
  });
});
