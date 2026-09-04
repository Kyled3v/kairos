import { describe, expect, it } from "vitest";
import { ModelRouter } from "../src/intelligence/models/router.js";

describe("ModelRouter", () => {
  it("registers and detects providers", () => {
    const router = new ModelRouter();

    router.register({
      id: "test-provider",
      name: "Test Provider",
      async generate() {
        return {
          content: "test",
          model: "test-model",
        };
      },
    });

    expect(router.hasProvider("test-provider")).toBe(true);
    expect(router.hasProvider("missing-provider")).toBe(false);
  });
});
