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

  async generate(
    providerId: string,
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new Error(`Model provider not registered: ${providerId}`);
    }

    return provider.generate(request);
  }
}
