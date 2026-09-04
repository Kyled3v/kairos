import { describe, expect, it } from "vitest";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../src/intelligence/models/types.js";
import { ModelRouter } from "../src/intelligence/models/router.js";

describe("ModelRouter", () => {
  it("registers and detects providers", () => {
    const router = new ModelRouter();

    const provider: ModelProvider = {
      id: "test-provider",
      name: "Test Provider",

      async generate(
        request: ModelRequest,
      ): Promise<ModelResponse> {
        return {
          content: "test",
          model: request.model,
          provider: "test-provider",
        };
      },
    };

    router.register(provider);

    expect(router.hasProvider("test-provider")).toBe(true);
    expect(router.getProvider("test-provider")).toBe(provider);
  });
});
