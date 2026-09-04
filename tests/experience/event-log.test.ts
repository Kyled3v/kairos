import { describe, expect, it } from "vitest";
import { InMemoryExperienceEventLog } from "../../src/core/experience/in-memory-event-log.js";

describe("InMemoryExperienceEventLog", () => {
  it("stores and retrieves execution events", () => {
    const log = new InMemoryExperienceEventLog();

    log.append({
      id: "event-1",
      executionId: "execution-1",
      cycle: 1,
      type: "goal-created",
      timestamp: new Date(),
      data: {
        goal: "Test goal",
      },
    });

    log.append({
      id: "event-2",
      executionId: "execution-2",
      cycle: 1,
      type: "goal-created",
      timestamp: new Date(),
      data: {
        goal: "Other goal",
      },
    });

    expect(log.getExecutionEvents("execution-1")).toHaveLength(1);
    expect(log.getExecutionEvents("execution-1")[0]?.id).toBe(
      "event-1",
    );
    expect(log.getAll()).toHaveLength(2);
  });

  it("can clear all events", () => {
    const log = new InMemoryExperienceEventLog();

    log.append({
      id: "event-1",
      executionId: "execution-1",
      cycle: 1,
      type: "goal-created",
      timestamp: new Date(),
      data: {},
    });

    log.clear();

    expect(log.getAll()).toHaveLength(0);
  });
});
