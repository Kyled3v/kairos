import type { MultiCycleRequest, MultiCycleResult } from "./types.js";
import type { PipelineDependencies } from "./pipeline.js";
import type { GoalDecomposer } from "../goals/types.js";
import type { ExperienceStore } from "../experience/record.js";
import type { ToolCallCollector } from "../tools/collector.js";
import { MultiCycleOrchestrator } from "./multi-cycle-orchestrator.js";
import { recordFromMultiCycleResult } from "../experience/recorder.js";

export interface SessionOrchestratorOptions {
  readonly maxCycles?: number;
  readonly convergenceThreshold?: number;
  readonly noProgressThreshold?: number;
  readonly sessionId?: string;
  readonly modelProvider?: string;
  readonly modelId?: string;
  readonly timeoutMs?: number;
}

export class SessionOrchestrator {
  private readonly inner: MultiCycleOrchestrator;

  constructor(
    private readonly dependencies: PipelineDependencies,
    private readonly options: SessionOrchestratorOptions = {},
    private readonly decomposer?: GoalDecomposer,
    private readonly experienceStore?: ExperienceStore,
    private readonly toolCallCollector?: ToolCallCollector,
  ) {
    this.inner = new MultiCycleOrchestrator(dependencies, {
      maxCycles: options.maxCycles ?? 10,
      convergenceThreshold: options.convergenceThreshold ?? 0.01,
      noProgressThreshold: options.noProgressThreshold ?? 3,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });
  }

  cancel(): void { this.inner.cancel(); }

  async run(goal: string): Promise<MultiCycleResult> {
    const startedAt = new Date();
    let subGoals: MultiCycleRequest["subGoals"] | undefined;
    if (this.decomposer !== undefined) {
      const goalObj = { id: crypto.randomUUID(), description: goal, priority: 1, createdAt: startedAt };
      const decomposition = await this.decomposer.decompose(goalObj);
      subGoals = decomposition.subGoals;
    }
    const request: MultiCycleRequest = {
      goal,
      ...(this.options.maxCycles !== undefined ? { maxCycles: this.options.maxCycles } : {}),
      ...(this.options.convergenceThreshold !== undefined ? { convergenceThreshold: this.options.convergenceThreshold } : {}),
      ...(this.options.noProgressThreshold !== undefined ? { noProgressThreshold: this.options.noProgressThreshold } : {}),
      ...(subGoals !== undefined ? { subGoals } : {}),
    };
    const result = await this.inner.run(request);
    if (this.experienceStore !== undefined) {
      const toolCalls = this.toolCallCollector?.drain() ?? [];
      const record = recordFromMultiCycleResult(
        result,
        {
          sessionId: this.options.sessionId ?? crypto.randomUUID(),
          ...(this.options.modelProvider !== undefined ? { modelProvider: this.options.modelProvider } : {}),
          ...(this.options.modelId !== undefined ? { modelId: this.options.modelId } : {}),
        },
        startedAt,
        toolCalls,
      );
      await this.experienceStore.save(record);
    }
    return result;
  }
}
