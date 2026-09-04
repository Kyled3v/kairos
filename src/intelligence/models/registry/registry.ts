import type {
  ModelDescriptor,
  ModelHealth,
} from "../types.js";

export class ModelRegistry {
  private readonly models = new Map<string, ModelDescriptor>();
  private readonly health = new Map<string, ModelHealth>();

  register(model: ModelDescriptor): void {
    this.models.set(model.id, model);
  }

  get(modelId: string): ModelDescriptor | undefined {
    return this.models.get(modelId);
  }

  getAll(): readonly ModelDescriptor[] {
    return [...this.models.values()];
  }

  getEnabled(): readonly ModelDescriptor[] {
    return [...this.models.values()].filter(
      (model) => model.enabled,
    );
  }

  updateHealth(health: ModelHealth): void {
    this.health.set(health.modelId, health);
  }

  getHealth(modelId: string): ModelHealth | undefined {
    return this.health.get(modelId);
  }
}
