import { describe, expect, it } from "vitest";
import { CodingTaskRunner } from "../../../src/agents/coding/task-runner.js";

describe("CodingTaskRunner", () => {
  it("runs a goal against the current repo and returns a result", async () => {
    const runner = new CodingTaskRunner({
      repoPath: process.cwd(),
      autoScanRepo: false,
      session: { maxCycles: 1 },
    });
    const result = await runner.run("Summarise the KAIROS project structure");
    expect(result.result.totalCycles).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.task.goal).toBe("Summarise the KAIROS project structure");
  });

  it("runAll executes goals in sequence", async () => {
    const runner = new CodingTaskRunner({
      repoPath: process.cwd(),
      autoScanRepo: false,
      session: { maxCycles: 1 },
    });
    const results = await runner.runAll(["goal one", "goal two"]);
    expect(results).toHaveLength(2);
    expect(results[0]?.task.goal).toBe("goal one");
    expect(results[1]?.task.goal).toBe("goal two");
  });
});
