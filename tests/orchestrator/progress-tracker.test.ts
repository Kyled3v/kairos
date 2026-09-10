import { describe, expect, it } from "vitest";
import { ProgressTracker } from "../../src/core/orchestrator/progress-tracker.js";

describe("ProgressTracker", () => {
  it("records snapshots and computes deltas", () => {
    const tracker = new ProgressTracker({
      convergenceThreshold: 0.01,
      noProgressThreshold: 3,
    });

    tracker.record(1, 0.2);
    tracker.record(2, 0.5);
    const snap = tracker.record(3, 0.8);

    expect(snap.cycle).toBe(3);
    expect(snap.score).toBe(0.8);
    expect(snap.delta).toBeCloseTo(0.3);
    expect(tracker.getSnapshots()).toHaveLength(3);
  });

  it("detects convergence after stable scores", () => {
    const tracker = new ProgressTracker({
      convergenceThreshold: 0.05,
      noProgressThreshold: 3,
    });

    tracker.record(1, 0.8);
    tracker.record(2, 0.801);
    tracker.record(3, 0.802);

    expect(tracker.hasConverged()).toBe(true);
  });

  it("detects no-progress after flat scores", () => {
    const tracker = new ProgressTracker({
      convergenceThreshold: 0.05,
      noProgressThreshold: 3,
    });

    tracker.record(1, 0.2);
    tracker.record(2, 0.2);
    tracker.record(3, 0.2);

    expect(tracker.hasNoProgress()).toBe(true);
  });

  it("does not falsely detect convergence early", () => {
    const tracker = new ProgressTracker({
      convergenceThreshold: 0.01,
      noProgressThreshold: 3,
    });

    tracker.record(1, 0.1);
    tracker.record(2, 0.5);

    expect(tracker.hasConverged()).toBe(false);
  });
});