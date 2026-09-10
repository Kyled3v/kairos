import { describe, expect, it, vi, afterEach } from "vitest";
import { AnthropicProvider } from "../../src/intelligence/models/providers/anthropic-provider.js";
import type { ModelRequest } from "../../src/intelligence/models/types.js";

function sseChunk(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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

describe("AnthropicProvider streaming", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assembles streamed text deltas into a full response and calls onDelta for each piece", async () => {
    const events = [
      sseChunk({ type: "message_start", message: { model: "claude-3-5-haiku-20241022", usage: { input_tokens: 12 } } }),
      sseChunk({ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } }),
      sseChunk({ type: "content_block_delta", delta: { type: "text_delta", text: ", world!" } }),
      sseChunk({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }),
      sseChunk({ type: "message_stop" }),
    ];

    // Split the raw SSE text across a chunk boundary that does not line
    // up with an event boundary, to exercise line-buffering.
    const rawText = events.join("");
    const midpoint = Math.floor(rawText.length / 2);
    const chunks = [rawText.slice(0, midpoint), rawText.slice(midpoint)];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(chunks)));

    const deltas: string[] = [];
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const request: ModelRequest = {
      model: "claude-3-5-haiku-20241022",
      messages: [{ role: "user", content: "Say hello" }],
      streaming: true,
      onDelta: (delta) => deltas.push(delta),
    };

    const response = await provider.generate(request);

    expect(response.content).toBe("Hello, world!");
    expect(deltas).toEqual(["Hello", ", world!"]);
    expect(response.streaming).toBe(true);
    expect(response.finishReason).toBe("end_turn");
    expect(response.usage?.inputTokens).toBe(12);
    expect(response.usage?.outputTokens).toBe(5);
    expect(response.usage?.totalTokens).toBe(17);
  });

  it("performs a normal non-streaming call when streaming is not requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_1",
          model: "claude-3-5-haiku-20241022",
          content: [{ type: "text", text: "Hi there" }],
          usage: { input_tokens: 3, output_tokens: 2 },
          stop_reason: "end_turn",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const response = await provider.generate({
      model: "claude-3-5-haiku-20241022",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(response.content).toBe("Hi there");
    expect(response.streaming).toBeUndefined();

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(call[1].body as string) as { stream?: boolean };
    expect(sentBody.stream).toBeUndefined();
  });
});