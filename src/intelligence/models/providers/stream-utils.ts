/**
 * Reads a fetch Response body (a web ReadableStream<Uint8Array>) and
 * yields it as complete text lines, buffering partial lines across
 * chunk boundaries (a chunk can split mid-line at any point). Used by
 * streaming-capable providers to parse SSE (Anthropic) and NDJSON
 * (Ollama) responses without pulling in an SSE parsing library.
 */
export async function* readStreamLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        yield buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    }
    if (buffer.length > 0) {
      yield buffer.replace(/\r$/, "");
    }
  } finally {
    reader.releaseLock();
  }
}