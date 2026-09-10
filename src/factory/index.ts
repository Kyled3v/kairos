import { ModelRouter } from "../intelligence/models/router.js";
import { ModelKairosRuntime } from "../intelligence/runtime/model-runtime.js";
import { BasicKairosRuntime } from "../core/runtime/basic-runtime.js";
import { SessionOrchestrator } from "../core/orchestrator/session-orchestrator.js";
import { MultiCycleOrchestrator } from "../core/orchestrator/multi-cycle-orchestrator.js";
import { BasicGoalDecomposer } from "../core/goals/basic-decomposer.js";
import { FileExperienceStore } from "../core/experience/file/file-experience-store.js";
import { InMemoryExperienceStore } from "../core/experience/in-memory-experience-store.js";
import { FileMemoryStore } from "../core/memory/file/file-store.js";
import { InMemoryMemoryStore } from "../core/memory/in-memory-store.js";
import { KairosMemory } from "../core/memory/kairos-memory.js";
import { ToolCallCollector } from "../core/tools/collector.js";
import type { PipelineDependencies } from "../core/orchestrator/pipeline.js";
import type { ExperienceStore } from "../core/experience/record.js";
import type { SessionOrchestratorOptions } from "../core/orchestrator/session-orchestrator.js";
import { NeonMemoryStore } from "../core/memory/neon/neon-store.js";
import { NeonExperienceStore } from "../core/experience/neon/neon-experience-store.js";

export interface KairosBasicConfig {
  readonly mode: "basic";
}

export interface KairosModelConfig {
  readonly mode: "model";
  readonly router: ModelRouter;
  readonly providerId: string;
  readonly modelId: string;
  readonly maxCycles?: number;
}

export interface KairosSessionConfig {
  readonly mode: "session";
  readonly dependencies: PipelineDependencies;
  readonly session?: SessionOrchestratorOptions;
  readonly experience?: {
    readonly type: "memory" | "file";
    readonly filePath?: string;
  };
  readonly experienceStore?: ExperienceStore;
  readonly memory?: {
    readonly type: "memory" | "file";
    readonly filePath?: string;
  };
  readonly decompose?: boolean;
  readonly toolCallCollector?: ToolCallCollector;
}

export type KairosConfig =
  | KairosBasicConfig
  | KairosModelConfig
  | KairosSessionConfig;

export function createKairos(config: KairosModelConfig): ModelKairosRuntime;
export function createKairos(config: KairosBasicConfig): BasicKairosRuntime;
export function createKairos(config: KairosSessionConfig): SessionOrchestrator;
export function createKairos(
  config: KairosConfig,
): ModelKairosRuntime | BasicKairosRuntime | SessionOrchestrator {
  if (config.mode === "model") {
    return new ModelKairosRuntime(config.router, {
      providerId: config.providerId,
      modelId: config.modelId,
      ...(config.maxCycles !== undefined ? { maxCycles: config.maxCycles } : {}),
    });
  }

  if (config.mode === "session") {
    // Prefer an explicitly supplied experience store (e.g. one the caller
    // needs to flush directly) over building a new one from `experience`.
    // Building a second, separate store from `experience` while the
    // caller flushes a different instance was a latent bug: flush() would
    // silently do nothing to the store actually receiving records.
    let experienceStore: ExperienceStore | undefined = config.experienceStore;
    if (experienceStore === undefined && config.experience !== undefined) {
      if (config.experience.type === "file" && config.experience.filePath !== undefined) {
        experienceStore = new FileExperienceStore({ filePath: config.experience.filePath });
      } else {
        experienceStore = new InMemoryExperienceStore();
      }
    }
    const collector = config.toolCallCollector ?? new ToolCallCollector();
    const decomposer = config.decompose === true ? new BasicGoalDecomposer() : undefined;
    return new SessionOrchestrator(
      config.dependencies,
      config.session,
      decomposer,
      experienceStore,
      collector,
    );
  }

  return new BasicKairosRuntime();
}

export interface KairosMemoryConfig {
  readonly type: "memory" | "file" | "neon";
  readonly filePath?: string;
  readonly writeDebounceMs?: number;
}

export async function createKairosMemory(
  config: KairosMemoryConfig,
): Promise<KairosMemory> {
  if (config.type === "file" && config.filePath !== undefined) {
    const storeOptions: { filePath: string; writeDebounceMs?: number } = {
      filePath: config.filePath,
    };
    if (config.writeDebounceMs !== undefined) {
      storeOptions.writeDebounceMs = config.writeDebounceMs;
    }
    const store = new FileMemoryStore(storeOptions);
    await store.load();
    return new KairosMemory(store);
  }
  if (config.type === "neon") {
    const store = new NeonMemoryStore();
    await store.load();
    return new KairosMemory(store);
  }
  return new KairosMemory(new InMemoryMemoryStore());
}

export interface KairosExperienceConfig {
  readonly type: "memory" | "file" | "neon";
  readonly filePath?: string;
}

export async function createExperienceStore(
  config: KairosExperienceConfig,
): Promise<ExperienceStore> {
  if (config.type === "file" && config.filePath !== undefined) {
    const store = new FileExperienceStore({ filePath: config.filePath });
    await store.load();
    return store;
  }
  if (config.type === "neon") {
    const store = new NeonExperienceStore();
    await store.load();
    return store;
  }
  return new InMemoryExperienceStore();
}

export {
  SessionOrchestrator,
  MultiCycleOrchestrator,
  BasicGoalDecomposer,
  ToolCallCollector,
  KairosMemory,
};

export * from "./pipeline-dependencies.js";
