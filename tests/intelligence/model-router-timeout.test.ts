import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { ModelTimeoutError } from "../../src/intelligence/models/errors.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../../src/intelligence/models/types.js";

const slowProvider: ModelProvider = {
  id: "slow",
  name: "Slow Provider",
  async generate(_req: ModelRequest): Promise<ModelResponse> {
    await new Promise((r) => setTimeout(r, 500));
    return { content: "too late", model: "slow-model", provider: "slow", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
  },
};

const fastProvider: ModelProvider = {
  id: "fast",
  name: "Fast Provider",
  async generate(_req: ModelRequest): Promise<ModelResponse> {
    return { content: "done", model: "fast-model", provider: "fast", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
  },
};

const baseRequest: ModelRequest = { model: "test-model", messages: [{ role: "user", content: "hi" }] };

describe("ModelRouter timeout", () => {
  it("throws ModelTimeoutError when provider exceeds timeoutMs", async () => {
    const router = new ModelRouter({ timeoutMs: 10 });
    router.register(slowProvider);
    await expect(router.generate("slow", baseRequest)).rejects.toThrow(ModelTimeoutError);
  });

  it("succeeds when provider responds within timeoutMs", async () => {
    const router = new ModelRouter({ timeoutMs: 5000 });
    router.register(fastProvider);
    const result = await router.generate("fast", baseRequest);
    expect(result.content).toBe("done");
  });
});
