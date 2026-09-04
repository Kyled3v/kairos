import type {
  ModelCapabilities,
  ModelDescriptor,
} from "../types.js";
import { ModelRegistry } from "../registry/registry.js";

export interface ModelSelectionRequirements {
  readonly capabilities?: Partial<ModelCapabilities>;
  readonly preferredProvider?: string;
  readonly requireFree?: boolean;
}

export class ModelSelector {
  constructor(
    private readonly registry: ModelRegistry,
  ) {}

  select(
    requirements: ModelSelectionRequirements = {},
  ): ModelDescriptor {
    const candidates = this.registry
      .getEnabled()
      .filter((model) => {
        if (
          requirements.preferredProvider &&
          model.providerId !== requirements.preferredProvider
        ) {
          return false;
        }

        if (
          requirements.requireFree &&
          model.costTier !== "free"
        ) {
          return false;
        }

        if (requirements.capabilities) {
          for (const [key, required] of Object.entries(
            requirements.capabilities,
          )) {
            if (
              required === true &&
              !model.capabilities[
                key as keyof ModelCapabilities
              ]
            ) {
              return false;
            }
          }
        }

        return true;
      });

    const selected = candidates[0];

    if (!selected) {
      throw new Error(
        "No model satisfies the requested requirements.",
      );
    }

    return selected;
  }
}
