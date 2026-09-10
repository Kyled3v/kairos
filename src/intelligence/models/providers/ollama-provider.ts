import type { ModelProvider, ModelRequest, ModelResponse } from "../types.js";
import { readStreamLines } from "./stream-utils.js";

export interface OllamaProviderOptions {
  readonly baseUrl?: string;
}

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly name = "Ollama";

  private readonly baseUrl: string;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:11434";
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const messages: OllamaMessage[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const streaming = request.streaming === true;

    const body: OllamaRequest = {
      model: request.model,
      messages,
      stream: streaming,
      options: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${text}`);
    }

    if (streaming) {
      return this.consumeStream(response, request);
    }

    const data = (await response.json()) as OllamaResponse;

    const inputTokens = data.prompt_eval_count;
    const outputTokens = data.eval_count;
    const hasUsage = inputTokens !== undefined || outputTokens !== undefined;

    return {
      content: data.message.content,
      model: data.model,
      provider: this.id,
      finishReason: data.done ? "stop" : "length",
      ...(hasUsage
        ? {
            usage: {
              ...(inputTokens !== undefined ? { inputTokens } : {}),
              ...(outputTokens !== undefined ? { outputTokens } : {}),
              ...((inputTokens !== undefined || outputTokens !== undefined)
                ? { totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) }
                : {}),
            },
          }
        : {}),
    };
  }

  private async consumeStream(response: Response, request: ModelRequest): Promise<ModelResponse> {
    if (response.body === null) {
      throw new Error("Ollama streaming response had no body.");
    }

    let content = "";
    let model = request.model;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: string | undefined;

    for await (const line of readStreamLines(response.body)) {
      if (line.trim() === "") continue;

      let chunk: OllamaResponse;
      try {
        chunk = JSON.parse(line) as OllamaResponse;
      } catch {
        continue;
      }

      if (chunk.model !== undefined) model = chunk.model;

      const delta = chunk.message?.content ?? "";
      if (delta.length > 0) {
        content += delta;
        request.onDelta?.(delta);
      }

      if (chunk.done) {
        finishReason = "stop";
        if (chunk.prompt_eval_count !== undefined) inputTokens = chunk.prompt_eval_count;
        if (chunk.eval_count !== undefined) outputTokens = chunk.eval_count;
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