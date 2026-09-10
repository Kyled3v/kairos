import { describe, expect, it } from "vitest";
import { readStreamLines } from "../../src/intelligence/models/providers/stream-utils.js";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of readStreamLines(stream)) lines.push(line);
  return lines;
}

describe("readStreamLines", () => {
  it("yields complete lines even when a line is split across chunks", async () => {
    const lines = await collect(makeStream(["line one\nli", "ne two\nline three"]));
    expect(lines).toEqual(["line one", "line two", "line three"]);
  });

  it("handles CRLF line endings", async () => {
    const lines = await collect(makeStream(["a\r\nb\r\n"]));
    expect(lines).toEqual(["a", "b"]);
  });

  it("yields nothing for an empty stream", async () => {
    const lines = await collect(makeStream([]));
    expect(lines).toEqual([]);
  });
});