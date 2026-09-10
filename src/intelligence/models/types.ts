export interface ModelMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
}

export interface ModelCapabilities {
  readonly reasoning: boolean;
  readonly vision: boolean;
  readonly toolUse: boolean;
  readonly structuredOutput: boolean;
  readonly streaming: boolean;
}

export interface ModelRequest {
  readonly model: string;
  readonly messages: readonly ModelMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: readonly ModelTool[];
  readonly responseFormat?: "text" | "json";
  /**
   * When true, the provider streams the response instead of waiting for
   * the full completion. onDelta (if supplied) is called with each
   * incremental piece of text as it arrives; the method still resolves
   * with the full assembled ModelResponse once the stream ends.
   */
  readonly streaming?: boolean;
  /** Called with each incremental text chunk while streaming. Ignored when streaming is not true. */
  readonly onDelta?: (delta: string) => void;
}

export interface ModelTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ModelResponse {
  readonly content: string;
  readonly model: string;
  readonly provider: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly finishReason?: string;
  readonly structuredOutput?: unknown;
  /** True when this response was produced by consuming a stream rather than a single non-streaming call. */
  readonly streaming?: boolean;
}

export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export interface ModelDescriptor {
  readonly id: string;
  readonly providerId: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: ModelCapabilities;
  readonly contextWindow?: number;
  readonly trainingCutoff?: string;
  readonly local: boolean;
  readonly costTier: "free" | "low" | "medium" | "high" | "unknown";
  readonly enabled: boolean;
}

export interface ModelHealth {
  readonly modelId: string;
  readonly healthy: boolean;
  readonly checkedAt: Date;
  readonly latencyMs?: number;
  readonly error?: string;
}