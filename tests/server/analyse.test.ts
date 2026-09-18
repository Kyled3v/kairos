import { describe, expect, it } from "vitest";
import { createKairosServer } from "../../src/server/http-server.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { KairosMemory } from "../../src/core/memory/kairos-memory.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import type { AddressInfo } from "node:net";
import type { ExperienceRecord } from "../../src/core/experience/record.js";

function makeRecord(overrides: Partial<ExperienceRecord> = {}): ExperienceRecord {
  const now = new Date();
  return { id: crypto.randomUUID(), sessionId: "s1", goal: "test", totalCycles: 2, outcome: "success", toolCalls: [], errors: [], startedAt: now, completedAt: now, durationMs: 100, metadata: {}, ...overrides };
}

describe("GET /experience/analyse", () => {
  it("returns metrics for an empty store", async () => {
    const store = new InMemoryExperienceStore();
    const server = createKairosServer({
      dependencies: createPipelineDependencies({ mode: "basic" }),
      experienceStore: store,
      memory: new KairosMemory(new InMemoryMemoryStore()),
    });
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch("http://localhost:" + port + "/experience/analyse");
      expect(res.status).toBe(200);
      const metrics = await res.json() as { totalSessions: number; successRate: number };
      expect(metrics.totalSessions).toBe(0);
      expect(metrics.successRate).toBe(0);
    } finally { server.close(); }
  });

  it("returns correct success rate for stored records", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ outcome: "success" }));
    await store.save(makeRecord({ outcome: "success" }));
    await store.save(makeRecord({ outcome: "failure" }));
    const server = createKairosServer({
      dependencies: createPipelineDependencies({ mode: "basic" }),
      experienceStore: store,
      memory: new KairosMemory(new InMemoryMemoryStore()),
    });
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch("http://localhost:" + port + "/experience/analyse");
      const metrics = await res.json() as { totalSessions: number; successRate: number };
      expect(metrics.totalSessions).toBe(3);
      expect(metrics.successRate).toBeCloseTo(2 / 3);
    } finally { server.close(); }
  });

  it("filters by outcome query param", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ outcome: "success" }));
    await store.save(makeRecord({ outcome: "failure" }));
    const server = createKairosServer({
      dependencies: createPipelineDependencies({ mode: "basic" }),
      experienceStore: store,
      memory: new KairosMemory(new InMemoryMemoryStore()),
    });
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch("http://localhost:" + port + "/experience/analyse?outcome=success");
      const metrics = await res.json() as { totalSessions: number; successRate: number };
      expect(metrics.totalSessions).toBe(1);
      expect(metrics.successRate).toBe(1);
    } finally { server.close(); }
  });
});
