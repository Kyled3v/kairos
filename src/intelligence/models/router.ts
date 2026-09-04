import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "./types.js";

export class ModelRouter {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getProvider(providerId: string): ModelProvider | undefined {
    return this.providers.get(providerId);
  }

  async generate(
    providerId: string,
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new Error(
        `Model provider not registered: ${providerId}`,
      );
    }

    const response = await provider.generate(request);

    if (!response.usage) {
      return response;
    }

    return {
      ...response,
      usage: {
        ...response.usage,
        totalTokens:
          response.usage.totalTokens ??
          (response.usage.inputTokens ?? 0) +
            (response.usage.outputTokens ?? 0),
      },
    };
  }
}
