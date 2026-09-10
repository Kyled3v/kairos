import type { ProgressSnapshot } from "./types.js";

export interface ProgressTrackerOptions {
  readonly convergenceThreshold: number;
  readonly noProgressThreshold: number;
}

export class ProgressTracker {
  private readonly scores: number[] = [];
  private readonly options: ProgressTrackerOptions;

  constructor(options: ProgressTrackerOptions) {
    this.options = options;
  }

  record(cycle: number, score: number): ProgressSnapshot {
    this.scores.push(score);

    const previous = this.scores[this.scores.length - 2];
    const delta = previous !== undefined ? score - previous : 0;

    const converging =
      this.scores.length >= 2 &&
      Math.abs(delta) < this.options.convergenceThreshold;

    return { cycle, score, delta, converging };
  }

  hasConverged(): boolean {
    if (this.scores.length < 3) {
      return false;
    }

    const recent = this.scores.slice(-3);
    const threshold = this.options.convergenceThreshold;

    return recent.every(
      (s, i) =>
        i === 0 ||
        Math.abs(s - (recent[i - 1] ?? 0)) < threshold,
    );
  }

  hasNoProgress(): boolean {
    const noProgressThreshold = this.options.noProgressThreshold;

    if (this.scores.length < noProgressThreshold) {
      return false;
    }

    const recent = this.scores.slice(-noProgressThreshold);
    const first = recent[0] ?? 0;
    const threshold = this.options.convergenceThreshold;

    return recent.every(
      (s) => Math.abs(s - first) < threshold,
    );
  }

  getSnapshots(): readonly ProgressSnapshot[] {
    const threshold = this.options.convergenceThreshold;

    return this.scores.map((score, index) => {
      const previous = this.scores[index - 1];
      const delta =
        previous !== undefined ? score - previous : 0;

      const converging =
        index > 0 && Math.abs(delta) < threshold;

      return {
        cycle: index + 1,
        score,
        delta,
        converging,
      };
    });
  }

  getLatestScore(): number {
    return this.scores[this.scores.length - 1] ?? 0;
  }
}