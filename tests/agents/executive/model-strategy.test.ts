import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../../../src/agents/identity.js";
import { createModelStrategy } from "../../../src/agents/executive/decomposition.js";
import { ModelRouter } from "../../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../../src/intelligence/models/providers/mock-provider.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../../../src/intelligence/models/types.js";
import type { DelegatableAgent } from "../../../src/agents/tool-boundary.js";

function fakeWorker(id: string, role: string, registry: AgentRegistry): DelegatableAgent {
  const identity = registry.register({ id, name: id, metadata: { role } });
  return {
    identity,
    run: async () => {
      throw new Error("not executed in unit tests");
    },
  };
}

/** Provider that echoes a canned JSON plan regardless of prompt. */
class ScriptedProvider implements ModelProvider {
  readonly id = "scripted";
  readonly name = "Scripted Provider";
  constructor(private readonly content: string) {}
  async generate(_request: ModelRequest): Promise<ModelResponse> {
    return {
      content: this.content,
      model: "scripted-model",
      provider: this.id,
      finishReason: "stop",
    };
  }
}

function workerIds(tasks: readonly { workerId: string }[]): string[] {
  return tasks.map((t) => t.workerId);
}

describe("createModelStrategy", () => {
  it("routes model-proposed sub-goals to role-matched workers", async () => {
    const registry = new AgentRegistry();
    const orion = fakeWorker("orion", "research", registry);
    const forge = fakeWorker("forge", "engineering", registry);

    const router = new ModelRouter();
    router.register(new ScriptedProvider(JSON.stringify([
      { description: "Investigate the failing module", order: 1 },
      { description: "Implement the repair", order: 2 },
    ])));

    const strategy = createModelStrategy([orion, forge], {
      router,
      providerId: "scripted",
      modelId: "scripted-model",
    });

    const tasks = await strategy("Fix the broken module");
    expect(workerIds(tasks)).toEqual(["orion", "forge"]);
    expect(tasks[0]?.goal).toBe("Investigate the failing module");
    expect(tasks[1]?.goal).toBe("Implement the repair");
    expect(tasks.every((t) => t.id.startsWith("model-"))).toBe(true);
  });

  it("falls back to the deterministic smart strategy when the model errors", async () => {
    const registry = new AgentRegistry();
    const orion = fakeWorker("orion", "research", registry);

    const router = new ModelRouter();
    router.register(new MockModelProvider()); // returns prose, not JSON

    const strategy = createModelStrategy([orion], {
      router,
      providerId: "mock",
      modelId: "mock-model",
    });

    const tasks = await strategy("Investigate the loop; then document it");
    expect(tasks.length).toBe(2);
    expect(tasks.every((t) => t.id.startsWith("smart-"))).toBe(true);
    expect(tasks.every((t) => t.workerId === "orion")).toBe(true);
  });

  it("falls back when the model returns an empty plan", async () => {
    const registry = new AgentRegistry();
    const orion = fakeWorker("orion", "research", registry);

    const router = new ModelRouter();
    router.register(new ScriptedProvider("[]"));

    const strategy = createModelStrategy([orion], {
      router,
      providerId: "scripted",
      modelId: "scripted-model",
    });

    const tasks = await strategy("Investigate anything");
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.id.startsWith("smart-")).toBe(true);
  });

  it("returns an empty plan when no eligible workers exist", async () => {
    const registry = new AgentRegistry();
    const atlas = fakeWorker("atlas", "executive", registry);

    const router = new ModelRouter();
    router.register(new ScriptedProvider(JSON.stringify([
      { description: "Should never be routed", order: 1 },
    ])));

    const strategy = createModelStrategy([atlas], {
      router,
      providerId: "scripted",
      modelId: "scripted-model",
    });

    expect(await strategy("Any objective")).toEqual([]);
  });
});

describe("AtlasAgent model decomposition mode", () => {
  it("uses model mode when configured and reports decompositionMode", async () => {
    const { AtlasAgent } = await import("../../../src/agents/executive/atlas-agent.js");
    const { OrionAgent } = await import("../../../src/agents/research/orion-agent.js");
    const { InMemoryMemoryStore } = await import("../../../src/core/memory/in-memory-store.js");

    const registry = new AgentRegistry();
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });

    const modelRouter = new ModelRouter();
    modelRouter.register(new ScriptedProvider(JSON.stringify([
      { description: "Examine the tool gateway", order: 1 },
    ])));

    const atlas = new AtlasAgent({
      memoryStore: new InMemoryMemoryStore(),
      registry,
      session: { maxCycles: 1 },
      router: modelRouter,
      providerId: "scripted",
      modelId: "scripted-model",
    });
    atlas.addWorker(orion);

    const outcome = await atlas.orchestrate("Objective needing one task", {
      decomposition: "model",
      record: false,
    });

    expect(outcome.decompositionMode).toBe("model");
    expect(outcome.delegationResults).toHaveLength(1);
    expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
    expect(outcome.status).toBe("complete");
  });

  it("model mode without a configured router falls back to smart", async () => {
    const { AtlasAgent } = await import("../../../src/agents/executive/atlas-agent.js");
    const { OrionAgent } = await import("../../../src/agents/research/orion-agent.js");
    const { InMemoryMemoryStore } = await import("../../../src/core/memory/in-memory-store.js");

    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    const atlas = new AtlasAgent({
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    atlas.addWorker(orion);

    const outcome = await atlas.orchestrate("Research the objective", {
      decomposition: "model",
      record: false,
    });

    expect(outcome.decompositionMode).toBe("smart");
    expect(outcome.delegationResults).toHaveLength(1);
    expect(outcome.status).toBe("complete");
  });
});
