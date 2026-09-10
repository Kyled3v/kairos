import { describe, expect, it, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { FileExperienceStore } from "../../src/core/experience/file/file-experience-store.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import type { ExperienceRecord } from "../../src/core/experience/record.js";

function makeRecord(overrides: Partial<ExperienceRecord> = {}): ExperienceRecord {
  const now = new Date();
  return { id: crypto.randomUUID(), sessionId: "s1", goal: "Test goal", totalCycles: 1, outcome: "success", toolCalls: [], errors: [], startedAt: now, completedAt: now, durationMs: 10, metadata: {}, ...overrides };
}

describe("InMemoryExperienceStore", () => {
  it("saves and retrieves", async () => {
    const store = new InMemoryExperienceStore();
    const r = makeRecord();
    await store.save(r);
    expect((await store.get(r.id))?.id).toBe(r.id);
  });
  it("queries by outcome", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ id: "r1", outcome: "success" }));
    await store.save(makeRecord({ id: "r2", outcome: "failure" }));
    const s = await store.query({ outcome: "success" });
    expect(s).toHaveLength(1);
    expect(s[0]?.id).toBe("r1");
  });
  it("queries by goal", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ id: "r1", goal: "Build Nexus auth" }));
    await store.save(makeRecord({ id: "r2", goal: "Fix a bug" }));
    const r = await store.query({ goalContains: "nexus" });
    expect(r).toHaveLength(1);
  });
  it("counts and clears", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord());
    await store.save(makeRecord());
    expect(await store.count()).toBe(2);
    await store.clear();
    expect(await store.count()).toBe(0);
  });
});

describe("FileExperienceStore", () => {
  const paths: string[] = [];
  afterEach(async () => {
    for (const p of paths) { if (existsSync(p)) await rm(p); }
    paths.length = 0;
  });
  function tmpPath() { return join(tmpdir(), `kairos-exp-${crypto.randomUUID()}.jsonl`); }

  it("saves and reloads", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileExperienceStore({ filePath: path });
    await store.load();
    const r = makeRecord({ goal: "Persist this" });
    await store.save(r);
    const store2 = new FileExperienceStore({ filePath: path });
    await store2.load();
    expect((await store2.get(r.id))?.goal).toBe("Persist this");
  });

  it("exports as JSONL", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileExperienceStore({ filePath: path });
    await store.load();
    await store.save(makeRecord({ id: "r1" }));
    await store.save(makeRecord({ id: "r2" }));
    const jsonl = await store.exportJsonl();
    const lines = jsonl.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(2);
  });

  it("starts empty when file missing", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileExperienceStore({ filePath: path });
    await store.load();
    expect(await store.count()).toBe(0);
  });

  it("session filter returns only matching session records", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileExperienceStore({ filePath: path });
    await store.load();
    await store.save(makeRecord({ id: "r1", sessionId: "session-A" }));
    await store.save(makeRecord({ id: "r2", sessionId: "session-B" }));
    await store.save(makeRecord({ id: "r3", sessionId: "session-A" }));
    const results = await store.query({ sessionId: "session-A" });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.sessionId === "session-A")).toBe(true);
  });

  it("exportJsonl produces one valid JSON object per line", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileExperienceStore({ filePath: path });
    await store.load();
    await store.save(makeRecord({ id: "e1" }));
    await store.save(makeRecord({ id: "e2" }));
    const jsonl = await store.exportJsonl();
    const lines = jsonl.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line) as { schemaVersion: number; record: { id: string } };
      expect(parsed.schemaVersion).toBe(1);
      expect(typeof parsed.record.id).toBe("string");
    }
  });
});

describe("FileExperienceStore versioning and resilience", () => {
  const paths: string[] = [];
  afterEach(async () => {
    for (const p of paths) { if (existsSync(p)) await rm(p); }
    paths.length = 0;
  });
  function tmpPath() { return join(tmpdir(), `kairos-exp-v-${crypto.randomUUID()}.jsonl`); }

  it("writes new records wrapped in a schema envelope", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileExperienceStore({ filePath: path });
    await store.load();
    await store.save(makeRecord({ id: "r1" }));
    const raw = await (await import("node:fs/promises")).readFile(path, "utf-8");
    const line = JSON.parse(raw.trim().split("\n")[0] ?? "{}") as { schemaVersion?: number; record?: unknown };
    expect(line.schemaVersion).toBe(1);
    expect(line.record).toBeDefined();
  });

  it("reads legacy unversioned lines transparently", async () => {
    const path = tmpPath(); paths.push(path);
    const bareRecord = makeRecord({ id: "legacy-1", goal: "Legacy line" });
    await appendFile(path, JSON.stringify(bareRecord) + "\n", "utf-8");

    const store = new FileExperienceStore({ filePath: path });
    await store.load();
    expect((await store.get("legacy-1"))?.goal).toBe("Legacy line");
    expect(store.getSkippedLineCount()).toBe(0);
  });

  it("tracks corrupt lines instead of silently discarding them", async () => {
    const path = tmpPath(); paths.push(path);
    await appendFile(path, "{ this is not valid json\n", "utf-8");
    await appendFile(path, JSON.stringify(makeRecord({ id: "good-1" })) + "\n", "utf-8");

    const store = new FileExperienceStore({ filePath: path });
    await store.load();

    expect(await store.count()).toBe(1);
    expect(store.getSkippedLineCount()).toBe(1);
    expect(store.getSkippedLines()[0]?.line).toContain("not valid json");
  });

  it("skips (rather than crashes on) a schema version newer than supported", async () => {
    const path = tmpPath(); paths.push(path);
    await appendFile(
      path,
      JSON.stringify({ schemaVersion: 999, record: makeRecord({ id: "future-1" }) }) + "\n",
      "utf-8",
    );
    await appendFile(path, JSON.stringify(makeRecord({ id: "good-1" })) + "\n", "utf-8");

    const store = new FileExperienceStore({ filePath: path });
    await store.load();

    expect(await store.get("future-1")).toBeUndefined();
    expect(await store.get("good-1")).toBeDefined();
    expect(store.getSkippedLineCount()).toBe(1);
    expect(store.getSkippedLines()[0]?.reason).toContain("newer than the supported version");
  });
});
