import { describe, expect, it } from "vitest";
import { ExperienceAnalyser } from "../../src/core/experience/analyser.js";
import { ExperienceExporter } from "../../src/core/experience/exporter.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import type { ExperienceRecord } from "../../src/core/experience/record.js";

function makeRecord(overrides: Partial<ExperienceRecord> = {}): ExperienceRecord {
  const now = new Date();
  return { id: crypto.randomUUID(), sessionId: "s1", goal: "test", totalCycles: 2, outcome: "success", toolCalls: [], errors: [], startedAt: now, completedAt: now, durationMs: 100, metadata: {}, ...overrides };
}

describe("ExperienceAnalyser", () => {
  it("returns zero metrics for empty store", async () => {
    const store = new InMemoryExperienceStore();
    const metrics = await new ExperienceAnalyser(store).analyse();
    expect(metrics.totalSessions).toBe(0);
    expect(metrics.successRate).toBe(0);
  });

  it("calculates correct success rate", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ outcome: "success" }));
    await store.save(makeRecord({ outcome: "success" }));
    await store.save(makeRecord({ outcome: "failure" }));
    const metrics = await new ExperienceAnalyser(store).analyse();
    expect(metrics.totalSessions).toBe(3);
    expect(metrics.successRate).toBeCloseTo(2 / 3);
  });

  it("calculates average cycles to completion", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ totalCycles: 2 }));
    await store.save(makeRecord({ totalCycles: 4 }));
    const metrics = await new ExperienceAnalyser(store).analyse();
    expect(metrics.averageCyclesToCompletion).toBe(3);
  });

  it("tracks model performance by provider", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ modelProvider: "anthropic", outcome: "success" }));
    await store.save(makeRecord({ modelProvider: "anthropic", outcome: "failure" }));
    await store.save(makeRecord({ modelProvider: "ollama", outcome: "success" }));
    const metrics = await new ExperienceAnalyser(store).analyse();
    expect(metrics.modelPerformanceByProvider["anthropic"]?.sessions).toBe(2);
    expect(metrics.modelPerformanceByProvider["anthropic"]?.successRate).toBeCloseTo(0.5);
    expect(metrics.modelPerformanceByProvider["ollama"]?.successRate).toBe(1);
  });
});

describe("ExperienceExporter", () => {
  it("exportJsonl produces one valid JSON object per line", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ id: "e1" }));
    await store.save(makeRecord({ id: "e2" }));
    const jsonl = await new ExperienceExporter(store).exportJsonl();
    const lines = jsonl.split("\n").filter((l: string) => l.trim() !== "");
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });

  it("exportJson produces a valid JSON array", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ id: "e1" }));
    const json = await new ExperienceExporter(store).exportJson();
    const parsed = JSON.parse(json) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("filtered export returns only matching records", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord({ id: "e1", outcome: "success" }));
    await store.save(makeRecord({ id: "e2", outcome: "failure" }));
    const jsonl = await new ExperienceExporter(store).exportJsonl({ outcome: "success" });
    const lines = jsonl.split("\n").filter((l: string) => l.trim() !== "");
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]!) as { id: string }).id).toBe("e1");
  });
});
