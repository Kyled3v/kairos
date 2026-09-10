import { describe, expect, it } from "vitest";
import { BasicGoalDecomposer } from "../../src/core/goals/basic-decomposer.js";

describe("BasicGoalDecomposer", () => {
  it("decomposes a goal into three ordered sub-goals", async () => {
    const decomposer = new BasicGoalDecomposer();

    const result = await decomposer.decompose({
      id: "goal-1",
      description: "Build the Nexus platform",
      priority: 1,
      createdAt: new Date(),
    });

    expect(result.goalId).toBe("goal-1");
    expect(result.subGoals).toHaveLength(3);
    expect(result.subGoals[0]?.order).toBe(1);
    expect(result.subGoals[1]?.order).toBe(2);
    expect(result.subGoals[2]?.order).toBe(3);
    expect(
      result.subGoals.every((sg) => !sg.completed),
    ).toBe(true);
    expect(
      result.subGoals.every(
        (sg) => sg.parentGoalId === "goal-1",
      ),
    ).toBe(true);
  });
});