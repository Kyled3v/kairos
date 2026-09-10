import { describe, expect, it, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { FileExperienceStore } from "../../src/core/experience/file/file-experience-store.js";
import type { ExperienceRecord } from "../../src/core/experience/record.js";

function makeRecord(overrides: Partial<ExperienceRecord> = {}): ExperienceRecord {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    sessionId: "s1",
    goal: "Test goal",
    totalCycles: 1,
    outcome: "success",
    toolCalls: [],
    errors: [],
    startedAt: now,
    completedAt: now,
    durationMs: 10,
    metadata: {},
    ...overrides,
  };
}

describe("ExperienceQuery.sessionId filter", () => {
  it("InMemoryExperienceStore filters by sessionId", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ id: "r1", sessionId: "agent-a" }));
    await store.save(makeRecord({ id: "r2", sessionId: "agent-b" }));

    const results = await store.query({ sessionId: "agent-a" });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("r1");
  });

  describe("FileExperienceStore", () => {
    const paths: string[] = [];
    afterEach(async () => {
      for (const p of paths) { if (existsSync(p)) await rm(p); }
      paths.length = 0;
    });

    it("filters by sessionId", async () => {
      const path = join(tmpdir(), `kairos-exp-session-${crypto.randomUUID()}.jsonl`);
      paths.push(path);
      const store = new FileExperienceStore({ filePath: path });
      await store.load();
      await store.save(makeRecord({ id: "r1", sessionId: "agent-a" }));
      await store.save(makeRecord({ id: "r2", sessionId: "agent-b" }));

      const results = await store.query({ sessionId: "agent-a" });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("r1");
    });
  });
});