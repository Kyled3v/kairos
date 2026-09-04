import type { KairosExecution } from "../runtime/types.js";
import type { MemoryStore } from "../memory/types.js";

export async function rememberExecution(
  execution: KairosExecution,
  store: MemoryStore,
): Promise<void> {
  const summary = [
    `Goal: ${execution.goal}`,
    `Completed: ${execution.completed}`,
    `Termination: ${execution.terminationReason ?? "none"}`,
    execution.reasoning
      ? `Reasoning: ${execution.reasoning.conclusion}`
      : undefined,
    execution.reflection
      ? `Reflection: ${execution.reflection.summary}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  await store.store({
    id: crypto.randomUUID(),
    type: "episodic",
    content: summary,
    importance: execution.completed ? 0.9 : 0.7,
    createdAt: execution.createdAt,
    metadata: {
      executionId: execution.id,
      cycle: execution.cycle,
      completed: execution.completed,
    },
  });

  if (execution.plan) {
    await store.store({
      id: crypto.randomUUID(),
      type: "procedural",
      content: execution.plan.steps
        .map((step) => `${step.order}. ${step.description}`)
        .join("\n"),
      importance: 0.8,
      createdAt: execution.createdAt,
      metadata: {
        executionId: execution.id,
        goal: execution.goal,
      },
    });
  }
}
