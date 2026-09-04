import { describe, expect, it } from "vitest";
import { MockModelProvider } from "../../src/intelligence/models/providers/mock-provider.js";

describe("MockModelProvider", () => {
  it("generates a model response", async () => {
    const provider = new MockModelProvider();

    const response = await provider.generate({
      model: "mock-model",
      messages: [
        {
          role: "user",
          content: "Explain Nexus.",
        },
      ],
    });

    expect(response.provider).toBe("mock");
    expect(response.model).toBe("mock-model");
    expect(response.content).toContain("Nexus");
    expect(response.usage?.totalTokens).toBe(30);
  });
});
