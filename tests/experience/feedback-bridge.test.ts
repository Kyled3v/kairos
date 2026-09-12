import { describe, expect, it } from "vitest";
import { withExperienceFeedback } from "../../src/core/experience/feedback-bridge.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import type { ExperienceRecord } from "../../src/core/experience/record.js";

function makeRecord(overrides: Partial<ExperienceRecord> = {}): ExperienceRecord {
  const now = new Date();
  return { id: crypto.randomUUID(), sessionId: "s1", goal: "build authentication system", totalCycles: 3, outcome: "success", toolCalls: [], errors: [], startedAt: now, completedAt: now, durationMs: 100, metadata: {}, ...overrides };
}

describe("withExperienceFeedback", () => {
  it("returns enriched dependencies that still produce a reasoning result", async () => {
    const store = new InMemoryExperienceStore();
    await store.save(makeRecord());
    const base = createPipelineDependencies({ mode: "basic" });
    const enriched = withExperienceFeedback(base, { store });
    const result = await enriched.reason("build authentication system", { cycle: 1 });
    expect(result.conclusion).toBeTruthy();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("does not throw when experience store query fails", async () => {
    const brokenStore = new InMemoryExperienceStore();
    const base = createPipelineDependencies({ mode: "basic" });
    (brokenStore as unknown as Record<string, unknown>)["query"] = async () => { throw new Error("db down"); };
    const enriched = withExperienceFeedback(base, { store: brokenStore });
    await expect(enriched.reason("any goal", { cycle: 1 })).resolves.toBeDefined();
  });

  it("passes through all other pipeline stages unchanged", () => {
    const store = new InMemoryExperienceStore();
    const base = createPipelineDependencies({ mode: "basic" });
    const enriched = withExperienceFeedback(base, { store });
    expect(enriched.plan).toBe(base.plan);
    expect(enriched.decide).toBe(base.decide);
    expect(enriched.observe).toBe(base.observe);
    expect(enriched.evaluate).toBe(base.evaluate);
    expect(enriched.reflect).toBe(base.reflect);
  });
});
