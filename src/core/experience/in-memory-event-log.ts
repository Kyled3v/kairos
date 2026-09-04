import type {
  ExperienceEvent,
  ExperienceEventLog,
} from "./types.js";

export class InMemoryExperienceEventLog
  implements ExperienceEventLog
{
  private readonly events: ExperienceEvent[] = [];

  append(event: ExperienceEvent): void {
    this.events.push(event);
  }

  getExecutionEvents(
    executionId: string,
  ): readonly ExperienceEvent[] {
    return this.events.filter(
      (event) => event.executionId === executionId,
    );
  }

  getAll(): readonly ExperienceEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}
