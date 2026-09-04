import { describe, expect, it } from "vitest";
import { ModelRegistry } from "../../src/intelligence/models/registry/registry.js";
import { ModelSelector } from "../../src/intelligence/models/selection/selector.js";

describe("ModelSelector", () => {
  it("selects a model matching requirements", () => {
    const registry = new ModelRegistry();

    registry.register({
      id: "free-reasoning",
      providerId: "provider-a",
      name: "Free Reasoning",
      version: "1",
      capabilities: {
        reasoning: true,
        vision: false,
        toolUse: false,
        structuredOutput: true,
        streaming: false,
      },
      local: false,
      costTier: "free",
      enabled: true,
    });

    registry.register({
      id: "paid-model",
      providerId: "provider-b",
      name: "Paid Model",
      version: "1",
      capabilities: {
        reasoning: true,
        vision: true,
        toolUse: true,
        structuredOutput: true,
        streaming: true,
      },
      local: false,
      costTier: "high",
      enabled: true,
    });

    const selector = new ModelSelector(registry);

    const selected = selector.select({
      requireFree: true,
      capabilities: {
        reasoning: true,
      },
    });

    expect(selected.id).toBe("free-reasoning");
  });

  it("fails when no model matches", () => {
    const registry = new ModelRegistry();
    const selector = new ModelSelector(registry);

    expect(() =>
      selector.select({
        requireFree: true,
      }),
    ).toThrow(
      "No model satisfies the requested requirements.",
    );
  });
});
