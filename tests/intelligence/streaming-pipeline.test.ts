import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { ModelReasoningEngine } from "../../src/intelligence/reasoning/model-reasoning-engine.js";

class StreamingMockProvider {
  readonly id = "streaming-mock";
  readonly name = "Streaming Mock";

  async generate(request: import("../../src/intelligence/models/types.js").ModelRequest) {
    const content = "Streamed conclusion for: " + (request.messages.find((m) => m.role === "user")?.content ?? "");
    if (request.streaming === true && request.onDelta !== undefined) {
      for (const char of content) {
        request.onDelta(char);
      }
    }
    return { content, model: request.model, provider: this.id, streaming: request.streaming === true };
  }
}

describe("Streaming pipeline", () => {
  it("calls onDelta for each chunk when streaming is enabled", async () => {
    const router = new ModelRouter();
    router.register(new StreamingMockProvider());

    const deltas: string[] = [];
    const engine = new ModelReasoningEngine(router, {
      providerId: "streaming-mock",
      modelId: "mock-model",
      streaming: true,
      onDelta: (d) => { deltas.push(d); },
    });

    const result = await engine.reason({
      goal: "Test streaming",
      observations: [],
      constraints: [],
    });

    expect(result.conclusion).toContain("Test streaming");
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.join("")).toBe(result.conclusion);
  });

  it("works normally without streaming enabled", async () => {
    const router = new ModelRouter();
    router.register(new StreamingMockProvider());

    const deltas: string[] = [];
    const engine = new ModelReasoningEngine(router, {
      providerId: "streaming-mock",
      modelId: "mock-model",
    });

    const result = await engine.reason({
      goal: "Test non-streaming",
      observations: [],
      constraints: [],
    });

    expect(result.conclusion).toContain("Test non-streaming");
    expect(deltas).toHaveLength(0);
  });
});
