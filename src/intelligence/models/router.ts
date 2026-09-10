import type { ModelProvider, ModelRequest, ModelResponse } from "./types.js";
import { ModelTimeoutError } from "./errors.js";

export const DEFAULT_MODEL_TIMEOUT_MS = 30_000;

export class ModelRouter {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly timeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS;
  }

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getProvider(providerId: string): ModelProvider | undefined {
    return this.providers.get(providerId);
  }

  async generate(providerId: string, request: ModelRequest): Promise<ModelResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Model provider not registered: ${providerId}`);
    }

    const timeoutMs = this.timeoutMs;
    const timeoutPromise = new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        reject(new ModelTimeoutError(providerId, timeoutMs));
      }, timeoutMs);
      // Allow Node.js to exit if this is the only thing pending
      if (typeof id === "object" && "unref" in id) (id as { unref(): void }).unref();
    });

    const response = await Promise.race([provider.generate(request), timeoutPromise]);

    if (!response.usage) return response;

    return {
      ...response,
      usage: {
        ...response.usage,
        totalTokens:
          response.usage.totalTokens ??
          (response.usage.inputTokens ?? 0) + (response.usage.outputTokens ?? 0),
      },
    };
  }
}