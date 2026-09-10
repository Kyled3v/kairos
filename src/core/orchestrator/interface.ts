import type { OrchestrationRequest, OrchestrationResult } from "./types.js";
import type { MultiCycleRequest, MultiCycleResult } from "./types.js";

export interface KairosOrchestrator {
  run(request: OrchestrationRequest): Promise<OrchestrationResult>;
}

export interface KairosMultiCycleOrchestrator {
  run(request: MultiCycleRequest): Promise<MultiCycleResult>;
}