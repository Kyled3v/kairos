import type { OrchestrationRequest, OrchestrationResult } from "./types.js";

export interface KairosOrchestrator {
  run(request: OrchestrationRequest): Promise<OrchestrationResult>;
}
