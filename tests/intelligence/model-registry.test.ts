import { describe, expect, it } from "vitest";
import { ModelRegistry } from "../../src/intelligence/models/registry/registry.js";

describe("ModelRegistry", () => {
  it("registers and retrieves models", () => {
    const registry = new ModelRegistry();

    registry.register({
      id: "mock-model",
      providerId: "mock",
      name: "Mock Model",
      version: "1.0",
      capabilities: {
        reasoning: true,
        vision: false,
        toolUse: false,
        structuredOutput: true,
        streaming: false,
      },
      local: true,
      costTier: "free",
      enabled: true,
    });

    expect(registry.get("mock-model")?.name).toBe(
      "Mock Model",
    );

    expect(registry.getEnabled()).toHaveLength(1);
  });
});
