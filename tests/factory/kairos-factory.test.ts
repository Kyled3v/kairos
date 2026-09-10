import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";
import { createKairos } from "../../src/factory/index.js";
import { BasicKairosRuntime } from "../../src/core/runtime/basic-runtime.js";
import { ModelKairosRuntime } from "../../src/intelligence/runtime/model-runtime.js";

describe("createKairos factory", () => {
  it("creates a BasicKairosRuntime in basic mode", () => {
    const kairos = createKairos({ mode: "basic" });
    expect(kairos).toBeInstanceOf(BasicKairosRuntime);
  });

  it("creates a ModelKairosRuntime in model mode", () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const kairos = createKairos({
      mode: "model",
      router,
      providerId: "mock",
      modelId: "mock-model",
    });

    expect(kairos).toBeInstanceOf(ModelKairosRuntime);
  });

  it("basic runtime executes a goal", async () => {
    const kairos = createKairos({ mode: "basic" });

    const result = await kairos.execute(
      "Create a safe plan for understanding Nexus requirements",
    );

    expect(result.completed).toBe(true);
  });

  it("model runtime executes a goal", async () => {
    const router = new ModelRouter();
    router.register(new MockModelProvider());

    const kairos = createKairos({
      mode: "model",
      router,
      providerId: "mock",
      modelId: "mock-model",
    });

    const result = await kairos.run(
      "Understand Nexus requirements",
    );

    expect(result.goal).toContain("Nexus");
    expect(result.cycles).toBeGreaterThanOrEqual(1);
  });
});