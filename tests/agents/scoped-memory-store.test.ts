import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { AgentScopedMemoryStore } from "../../src/agents/scoped-memory-store.js";

describe("AgentScopedMemoryStore", () => {
  it("isolates retrieval between two agents sharing the same underlying store", async () => {
    const shared = new InMemoryMemoryStore();
    const agentA = new AgentScopedMemoryStore(shared, "agent-a");
    const agentB = new AgentScopedMemoryStore(shared, "agent-b");

    await agentA.store({ id: "m1", type: "semantic", content: "A's fact about KAIROS", importance: 0.9, createdAt: new Date(), metadata: {} });
    await agentB.store({ id: "m2", type: "semantic", content: "B's fact about KAIROS", importance: 0.9, createdAt: new Date(), metadata: {} });

    const aResults = await agentA.retrieve({ query: "KAIROS" });
    const bResults = await agentB.retrieve({ query: "KAIROS" });

    expect(aResults).toHaveLength(1);
    expect(aResults[0]?.id).toBe("m1");
    expect(bResults).toHaveLength(1);
    expect(bResults[0]?.id).toBe("m2");
  });

  it("get() returns undefined for another agent's memory", async () => {
    const shared = new InMemoryMemoryStore();
    const agentA = new AgentScopedMemoryStore(shared, "agent-a");
    const agentB = new AgentScopedMemoryStore(shared, "agent-b");

    await agentA.store({ id: "m1", type: "working", content: "secret", importance: 0.5, createdAt: new Date(), metadata: {} });

    expect(await agentA.get("m1")).toBeDefined();
    expect(await agentB.get("m1")).toBeUndefined();
  });

  it("delete() cannot remove another agent's memory", async () => {
    const shared = new InMemoryMemoryStore();
    const agentA = new AgentScopedMemoryStore(shared, "agent-a");
    const agentB = new AgentScopedMemoryStore(shared, "agent-b");

    await agentA.store({ id: "m1", type: "working", content: "secret", importance: 0.5, createdAt: new Date(), metadata: {} });

    expect(await agentB.delete("m1")).toBe(false);
    expect(await agentA.get("m1")).toBeDefined();
    expect(await agentA.delete("m1")).toBe(true);
    expect(await agentA.get("m1")).toBeUndefined();
  });

  it("clear() only clears the calling agent's memories", async () => {
    const shared = new InMemoryMemoryStore();
    const agentA = new AgentScopedMemoryStore(shared, "agent-a");
    const agentB = new AgentScopedMemoryStore(shared, "agent-b");

    await agentA.store({ id: "m1", type: "working", content: "a", importance: 0.5, createdAt: new Date(), metadata: {} });
    await agentB.store({ id: "m2", type: "working", content: "b", importance: 0.5, createdAt: new Date(), metadata: {} });

    await agentA.clear();

    expect(await agentA.retrieve({ query: "" })).toHaveLength(0);
    expect(await agentB.retrieve({ query: "" })).toHaveLength(1);
  });
});