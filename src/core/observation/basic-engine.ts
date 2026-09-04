import type {
  Observation,
  ObservationContext,
  ObservationEngine,
} from "./types.js";

export class BasicObservationEngine implements ObservationEngine {
  async observe(context: ObservationContext): Promise<Observation> {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      source: "action-execution",
      data: {
        actionId: context.actionId,
        expectedOutcome: context.expectedOutcome,
        actualOutcome: context.actualOutcome,
      },
    };
  }
}
