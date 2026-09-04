import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";

describe("ModelRouter errors", () => {
  it("rejects unknown providers", async () => {
    const router = new ModelRouter();

    await expect(
      router.generate("missing-provider", {
        model: "unknown",
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
      }),
    ).rejects.toThrow(
      "Model provider not registered: missing-provider",
    );
  });
});
