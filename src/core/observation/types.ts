export interface Observation {
  readonly id: string;
  readonly timestamp: Date;
  readonly source: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ObservationContext {
  readonly actionId: string;
  readonly expectedOutcome?: unknown;
  readonly actualOutcome: unknown;
}

export interface ObservationEngine {
  observe(context: ObservationContext): Promise<Observation>;
}
