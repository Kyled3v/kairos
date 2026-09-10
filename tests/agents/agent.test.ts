import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../../src/agents/identity.js";
import { AgentMessageBus } from "../../src/agents/message-bus.js";
import { KairosAgent } from "../../src/agents/agent.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";

describe("KairosAgent", () => {
  it("runs a goal and records experience tagged with its own identity", async () => {
    const registry = new AgentRegistry();
    const identity = registry.register({ name: "Researcher" });
    const sharedMemory = new InMemoryMemoryStore();
    const experienceStore = new InMemoryExperienceStore();

    const agent = new KairosAgent({
      identity,
      dependencies: createPipelineDependencies({ mode: "basic" }),
      memoryStore: sharedMemory,
      experienceStore,
      session: { maxCycles: 1 },
    });

    const result = await agent.run("Investigate the KAIROS test suite");
    expect(result.totalCycles).toBeGreaterThan(0);

    const records = await experienceStore.query({ sessionId: identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(identity.id);
  });

  it("gives each agent an isolated memory view over a shared store", async () => {
    const registry = new AgentRegistry();
    const identityA = registry.register({ name: "A" });
    const identityB = registry.register({ name: "B" });
    const sharedMemory = new InMemoryMemoryStore();
    const dependencies = createPipelineDependencies({ mode: "basic" });

    const agentA = new KairosAgent({ identity: identityA, dependencies, memoryStore: sharedMemory });
    const agentB = new KairosAgent({ identity: identityB, dependencies, memoryStore: sharedMemory });

    await agentA.memory.working.remember("Only agent A should see this");
    await agentB.memory.working.remember("Only agent B should see this");

    const aRecall = await agentA.memory.recall({ query: "agent A", type: "working" });
    const bRecall = await agentB.memory.recall({ query: "agent A", type: "working" });

    expect(aRecall).toHaveLength(1);
    expect(bRecall).toHaveLength(0);
  });

  it("lets two agents exchange messages through a shared bus", () => {
    const registry = new AgentRegistry();
    const identityA = registry.register({ name: "A" });
    const identityB = registry.register({ name: "B" });
    const bus = new AgentMessageBus();
    const dependencies = createPipelineDependencies({ mode: "basic" });
    const sharedMemory = new InMemoryMemoryStore();

    const agentA = new KairosAgent({ identity: identityA, dependencies, memoryStore: sharedMemory, messageBus: bus });
    const agentB = new KairosAgent({ identity: identityB, dependencies, memoryStore: sharedMemory, messageBus: bus });

    agentA.send(identityB.id, "status?");
    const received = agentB.receiveMessages();

    expect(received).toHaveLength(1);
    expect(received[0]?.content).toBe("status?");
    expect(received[0]?.from).toBe(identityA.id);
    expect(agentB.receiveMessages()).toHaveLength(0);
  });

  it("agent id is stable across multiple method calls", async () => {
    const registry = new AgentRegistry();
    const identity = registry.register({ name: "Stable" });
    const agent = new KairosAgent({
      identity,
      dependencies: createPipelineDependencies({ mode: "basic" }),
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    expect(agent.identity.id).toBe(identity.id);
    await agent.run("first goal");
    expect(agent.identity.id).toBe(identity.id);
    await agent.run("second goal");
    expect(agent.identity.id).toBe(identity.id);
  });

  it("throws when constructed with an empty identity id", () => {
    const identity = { id: "", name: "Bad", createdAt: new Date(), metadata: {} };
    expect(() => new KairosAgent({
      identity,
      dependencies: createPipelineDependencies({ mode: "basic" }),
      memoryStore: new InMemoryMemoryStore(),
    })).toThrow("Agent identity id must not be empty");
  });
});
