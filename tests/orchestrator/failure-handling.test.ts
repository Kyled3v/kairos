import { describe, expect, it } from "vitest";
import {
  BasicKairosOrchestrator,
} from "../../src/core/orchestrator/orchestrator.js";
import type {
  PipelineDependencies,
} from "../../src/core/orchestrator/pipeline.js";

describe("orchestration failure handling", () => {
  it("wraps pipeline failures with orchestration context", async () => {
    const dependencies: PipelineDependencies = {
      async reason() {
        throw new Error("model unavailable");
      },
      async plan() {
        throw new Error("unreachable");
      },
      async decide() {
        throw new Error("unreachable");
      },
      async observe() {
        throw new Error("unreachable");
      },
      async evaluate() {
        throw new Error("unreachable");
      },
      async reflect() {
        throw new Error("unreachable");
      },
    };

    const orchestrator = new BasicKairosOrchestrator(
      dependencies,
    );

    await expect(
      orchestrator.run({ goal: "test" }),
    ).rejects.toThrow(
      "KAIROS orchestration failed during cycle 1.",
    );
  });

  it("rejects invalid cycle limits", async () => {
    const orchestrator = new BasicKairosOrchestrator(
      {} as PipelineDependencies,
    );

    await expect(
      orchestrator.run({
        goal: "test",
        maxCycles: 0,
      }),
    ).rejects.toThrow(
      "maxCycles must be at least 1.",
    );
  });
});
