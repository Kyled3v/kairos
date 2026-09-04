import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { KairosMemory } from "../../src/core/memory/kairos-memory.js";

describe("KairosMemory", () => {
  it("supports specialized memory systems", async () => {
    const store = new InMemoryMemoryStore();
    const memory = new KairosMemory(store);

    await memory.working.remember(
      "Current Nexus task",
    );

    await memory.episodic.rememberExperience(
      "Previously completed Nexus analysis",
    );

    await memory.semantic.rememberFact(
      "Nexus supports multiple businesses",
    );

    await memory.procedural.rememberProcedure(
      "Review requirements before planning",
    );

    expect(
      await memory.working.recall("Nexus"),
    ).toHaveLength(1);

    expect(
      await memory.episodic.recall("Nexus"),
    ).toHaveLength(1);

    expect(
      await memory.semantic.recall("Nexus"),
    ).toHaveLength(1);

    expect(
      await memory.procedural.recall("requirements"),
    ).toHaveLength(1);
  });
});
