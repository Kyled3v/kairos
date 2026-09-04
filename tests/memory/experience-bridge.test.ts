import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { rememberExecution } from "../../src/core/memory/experience-bridge.js";
import type { KairosExecution } from "../../src/core/runtime/types.js";

describe("rememberExecution", () => {
  it("converts an execution into episodic and procedural memory", async () => {
    const store = new InMemoryMemoryStore();

    const execution: KairosExecution = {
      id: "execution-1",
      goal: "Understand Nexus requirements",
      currentState: "COMPLETE",
      cycle: 1,
      reasoning: {
        conclusion: "The requirements should be analyzed systematically.",
        confidence: 0.8,
        reasoningSteps: ["Analyze requirements"],
      },
      plan: {
        goal: "Understand Nexus requirements",
        rationale: "Systematic analysis is appropriate.",
        steps: [
          {
            id: "step-1",
            description: "Review requirements",
            order: 1,
          },
        ],
      },
      completed: true,
      terminationReason: "Objective completed.",
      createdAt: new Date(),
      completedAt: new Date(),
    };

    await rememberExecution(execution, store);

    const episodic = await store.retrieve({
      query: "Nexus",
      type: "episodic",
    });

    const procedural = await store.retrieve({
      query: "Review requirements",
      type: "procedural",
    });

    expect(episodic).toHaveLength(1);
    expect(procedural).toHaveLength(1);
  });
});
