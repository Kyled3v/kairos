import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";

describe("InMemoryMemoryStore", () => {
  it("stores and retrieves memories", async () => {
    const store = new InMemoryMemoryStore();

    await store.store({
      id: "memory-1",
      type: "semantic",
      content: "Nexus is a business operating system.",
      importance: 0.9,
      createdAt: new Date(),
      metadata: {},
    });

    const results = await store.retrieve({
      query: "Nexus",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.content).toContain("Nexus");
  });

  it("filters by memory type", async () => {
    const store = new InMemoryMemoryStore();

    await store.store({
      id: "memory-1",
      type: "semantic",
      content: "Nexus semantic fact",
      importance: 0.9,
      createdAt: new Date(),
      metadata: {},
    });

    await store.store({
      id: "memory-2",
      type: "episodic",
      content: "Nexus previous experience",
      importance: 0.8,
      createdAt: new Date(),
      metadata: {},
    });

    const results = await store.retrieve({
      query: "Nexus",
      type: "semantic",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.type).toBe("semantic");
  });

  it("respects result limits", async () => {
    const store = new InMemoryMemoryStore();

    for (let index = 1; index <= 5; index += 1) {
      await store.store({
        id: `memory-${index}`,
        type: "working",
        content: `Memory ${index}`,
        importance: index / 10,
        createdAt: new Date(),
        metadata: {},
      });
    }

    const results = await store.retrieve({
      query: "Memory",
      limit: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.importance).toBeGreaterThan(
      results[1]?.importance ?? 0,
    );
  });

  it("deletes memories", async () => {
    const store = new InMemoryMemoryStore();

    await store.store({
      id: "memory-1",
      type: "working",
      content: "Temporary memory",
      importance: 0.5,
      createdAt: new Date(),
      metadata: {},
    });

    expect(await store.delete("memory-1")).toBe(true);
    expect(await store.get("memory-1")).toBeUndefined();
  });
});
