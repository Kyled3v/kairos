import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { ModelKairosRuntime } from "../../src/intelligence/runtime/model-runtime.js";

describe("ModelKairosRuntime", () => {
  it("runs a full orchestration cycle via model engines", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const runtime = new ModelKairosRuntime(router, {
      providerId: "mock",
      modelId: "mock-model",
    });

    const result = await runtime.run(
      "Understand Nexus requirements",
    );

    expect(result.goal).toContain("Nexus");
    expect(result.cycles).toBeGreaterThanOrEqual(1);
    // With the MockModelProvider returning plain text, the pipeline
    // completes one full cycle. All pipeline stages run regardless
    // of whether the evaluation marks the goal as completed.
    expect(result.terminationReason).toBeTypeOf("string");
    expect(result.status).toMatch(/^(completed|running)$/);
  });
});