import { CodingAgent } from "./coding-agent.js";
import type { CodingAgentOptions, CodingTask } from "./coding-agent.js";
import type { MultiCycleResult } from "../../core/orchestrator/types.js";
import { scanRepository, buildContextSummary } from "./repository-context.js";

export interface TaskRunnerOptions extends CodingAgentOptions {
  readonly repoPath: string;
  readonly autoScanRepo?: boolean;
}

export interface TaskResult {
  readonly task: CodingTask;
  readonly result: MultiCycleResult;
  readonly durationMs: number;
}

/**
 * CodingTaskRunner: points a CodingAgent at a real repository.
 * Optionally scans the repo for context before running each task.
 * Supports running a sequence of tasks against the same agent.
 */
export class CodingTaskRunner {
  private readonly agent: CodingAgent;
  private readonly repoPath: string;
  private readonly autoScanRepo: boolean;

  constructor(options: TaskRunnerOptions) {
    const { repoPath, autoScanRepo = true, ...agentOptions } = options;
    this.repoPath = repoPath;
    this.autoScanRepo = autoScanRepo;
    this.agent = new CodingAgent({ ...agentOptions, workspacePath: repoPath });
  }

  async run(goal: string, additionalContext?: string): Promise<TaskResult> {
    const startedAt = Date.now();
    let task: CodingTask = { goal };

    if (this.autoScanRepo) {
      try {
        const repoContext = await scanRepository(this.repoPath);
        const contextSummary = buildContextSummary(repoContext);
        task = {
          goal,
          context: repoContext,
          additionalContext: [
            contextSummary,
            ...(additionalContext !== undefined ? [additionalContext] : []),
          ].join("\n\n"),
        };
      } catch {
        task = { goal, ...(additionalContext !== undefined ? { additionalContext } : {}) };
      }
    }

    const result = await this.agent.run(task);
    return { task, result, durationMs: Date.now() - startedAt };
  }

  async runAll(goals: readonly string[]): Promise<readonly TaskResult[]> {
    const results: TaskResult[] = [];
    for (const goal of goals) {
      results.push(await this.run(goal));
    }
    return results;
  }
}
