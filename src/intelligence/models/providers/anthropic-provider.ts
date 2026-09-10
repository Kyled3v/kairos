import type { ModelProvider, ModelRequest, ModelResponse } from "../types.js";
import { readStreamLines } from "./stream-utils.js";

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  stream?: boolean;
}

interface AnthropicContent {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  id: string;
  model: string;
  content: AnthropicContent[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason: string;
}

// Minimal shape of the fields this provider reads from Anthropic's SSE
// stream events. Anthropic sends several event types per streamed
// request (message_start, content_block_start, content_block_delta,
// content_block_stop, message_delta, message_stop); only the fields
// actually used to reconstruct content and usage are modeled here.
interface AnthropicStreamEvent {
  type: string;
  message?: { model?: string; usage?: { input_tokens?: number } };
  delta?: { type?: string; text?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const systemMessages = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");

    const conversationMessages: AnthropicMessage[] = request.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const body: AnthropicRequest = {
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      messages: conversationMessages,
      ...(systemMessages.length > 0 ? { system: systemMessages } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.streaming === true ? { stream: true } : {}),
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    if (request.streaming === true) {
      return this.consumeStream(response, request);
    }

    const data = (await response.json()) as AnthropicResponse;

    const content = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");

    return {
      content,
      model: data.model,
      provider: this.id,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: data.stop_reason,
    };
  }

  private async consumeStream(response: Response, request: ModelRequest): Promise<ModelResponse> {
    if (response.body === null) {
      throw new Error("Anthropic streaming response had no body.");
    }

    let content = "";
    let model = request.model;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: string | undefined;

    for await (const line of readStreamLines(response.body)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (payload === "" || payload === "[DONE]") continue;

      let event: AnthropicStreamEvent;
      try {
        event = JSON.parse(payload) as AnthropicStreamEvent;
      } catch {
        continue;
      }

      if (event.type === "message_start") {
        if (event.message?.model !== undefined) model = event.message.model;
        if (event.message?.usage?.input_tokens !== undefined) {
          inputTokens = event.message.usage.input_tokens;
        }
      } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const text = event.delta.text ?? "";
        content += text;
        request.onDelta?.(text);
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason !== undefined) finishReason = event.delta.stop_reason;
        if (event.usage?.output_tokens !== undefined) outputTokens = event.usage.output_tokens;
      }
    }

    const hasUsage = inputTokens !== undefined || outputTokens !== undefined;

    return {
      content,
      model,
      provider: this.id,
      streaming: true,
      ...(finishReason !== undefined ? { finishReason } : {}),
      ...(hasUsage
        ? {
            usage: {
              ...(inputTokens !== undefined ? { inputTokens } : {}),
              ...(outputTokens !== undefined ? { outputTokens } : {}),
              totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
            },
          }
        : {}),
    };
  }
}