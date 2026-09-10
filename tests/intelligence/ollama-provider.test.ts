import { describe, expect, it, vi, afterEach } from "vitest";
import { OllamaProvider } from "../../src/intelligence/models/providers/ollama-provider.js";
import type { ModelRequest } from "../../src/intelligence/models/types.js";

function ndjsonLine(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

function makeStreamResponse(rawChunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of rawChunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("OllamaProvider streaming", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assembles streamed NDJSON chunks into a full response and calls onDelta", async () => {
    const lines = [
      ndjsonLine({ model: "llama3", message: { role: "assistant", content: "Hel" }, done: false }),
      ndjsonLine({ model: "llama3", message: { role: "assistant", content: "lo!" }, done: false }),
      ndjsonLine({ model: "llama3", message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 8, eval_count: 4 }),
    ];

    const rawText = lines.join("");
    const midpoint = Math.floor(rawText.length / 2);
    const chunks = [rawText.slice(0, midpoint), rawText.slice(midpoint)];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(chunks)));

    const deltas: string[] = [];
    const provider = new OllamaProvider();
    const request: ModelRequest = {
      model: "llama3",
      messages: [{ role: "user", content: "Say hello" }],
      streaming: true,
      onDelta: (delta) => deltas.push(delta),
    };

    const response = await provider.generate(request);

    expect(response.content).toBe("Hello!");
    expect(deltas).toEqual(["Hel", "lo!"]);
    expect(response.streaming).toBe(true);
    expect(response.finishReason).toBe("stop");
    expect(response.usage?.inputTokens).toBe(8);
    expect(response.usage?.outputTokens).toBe(4);
  });

  it("sends stream: false and performs a normal call when streaming is not requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "llama3",
          message: { role: "assistant", content: "Hi there" },
          done: true,
          prompt_eval_count: 3,
          eval_count: 2,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider();
    const response = await provider.generate({
      model: "llama3",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(response.content).toBe("Hi there");
    expect(response.streaming).toBeUndefined();

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(call[1].body as string) as { stream: boolean };
    expect(sentBody.stream).toBe(false);
  });
});