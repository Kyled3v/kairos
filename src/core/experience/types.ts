export const EXPERIENCE_EVENT_TYPES = [
  "goal-created",
  "state-transition",
  "reasoning-completed",
  "plan-created",
  "decision-made",
  "authorization-checked",
  "action-executed",
  "observation-recorded",
  "evaluation-completed",
  "reflection-completed",
  "memory-created",
  "memory-retrieved",
  "execution-completed",
] as const;

export type ExperienceEventType =
  (typeof EXPERIENCE_EVENT_TYPES)[number];

export interface ExperienceEvent {
  readonly id: string;
  readonly executionId: string;
  readonly cycle: number;
  readonly type: ExperienceEventType;
  readonly timestamp: Date;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ExperienceEventLog {
  append(event: ExperienceEvent): void;

  getExecutionEvents(
    executionId: string,
  ): readonly ExperienceEvent[];

  getAll(): readonly ExperienceEvent[];

  clear(): void;
}
