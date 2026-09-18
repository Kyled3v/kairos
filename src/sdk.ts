/**
 * KAIROS Public SDK
 *
 * This is the stable public entry point for developers building on KAIROS.
 * Import from here, not from src/index.ts or internal paths.
 *
 * Internal engine classes (BasicReasoningEngine, BasicPlanningEngine, etc.)
 * are intentionally excluded — they are implementation details subject to
 * change without notice. Depend on the interfaces and factories instead.
 *
 * @example
 * ```ts
 * import { createKairos, createKairosMemory, createExperienceStore } from "@kyledev/kairos/sdk";
 * import { createPipelineDependencies } from "@kyledev/kairos/sdk";
 *
 * const orchestrator = createKairos({
 *   mode: "session",
 *   dependencies: createPipelineDependencies({ mode: "basic" }),
 *   session: { maxCycles: 10 },
 * });
 *
 * const result = await orchestrator.run("Analyse the codebase");
 * ```
 */

// ── Factories (primary entry points) ─────────────────────────────────────────
export {
  createKairos,
  createKairosMemory,
  createExperienceStore,
} from "./factory/index.js";

export {
  createPipelineDependencies,
} from "./factory/pipeline-dependencies.js";

// ── Configuration types ───────────────────────────────────────────────────────
export type {
  KairosConfig,
  KairosBasicConfig,
  KairosModelConfig,
  KairosSessionConfig,
  KairosMemoryConfig,
  KairosExperienceConfig,
} from "./factory/index.js";

export type {
  BasicPipelineConfig,
  ModelPipelineConfig,
  StreamingOptions,
} from "./factory/pipeline-dependencies.js";

// ── Orchestration interfaces and result types ─────────────────────────────────
export type {
  KairosOrchestrator,
  KairosMultiCycleOrchestrator,
} from "./core/orchestrator/interface.js";

export type {
  OrchestrationRequest,
  OrchestrationResult,
  MultiCycleRequest,
  MultiCycleResult,
  CycleRecord,
  ProgressSnapshot,
  TerminationReason,
  OrchestrationStatus,
} from "./core/orchestrator/types.js";

export type {
  SessionOrchestratorOptions,
} from "./core/orchestrator/session-orchestrator.js";

// ── Tool system (public surface) ──────────────────────────────────────────────
export type {
  Tool,
  ToolDefinition,
  ToolInput,
  ToolOutput,
  ToolCapability,
  ToolPermission,
  ToolRisk,
  ToolPolicyDecision,
  ToolQuery,
  ToolInvoker,
} from "./core/tools/types.js";

export { ToolRegistry } from "./core/tools/registry.js";
export { ToolPolicy } from "./core/tools/policy.js";
export { ToolGateway } from "./core/tools/gateway.js";
export { ObservedToolGateway } from "./core/tools/observed-gateway.js";
export { ToolCallCollector } from "./core/tools/collector.js";

// ── Built-in tools ────────────────────────────────────────────────────────────
export {
  calculatorTool,
  dateTimeTool,
  dataLookupTool,
  mockFileReadTool,
  mockFileWriteTool,
  mockHttpTool,
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  searchCodeTool,
  runCommandTool,
} from "./core/tools/built-in/index.js";

// ── Memory system ─────────────────────────────────────────────────────────────
export { KairosMemory } from "./core/memory/kairos-memory.js";

export type {
  Memory,
  MemoryQuery,
  MemoryStore,
  PersistentMemoryStore,
  MemoryType,
} from "./core/memory/types.js";

// ── Experience system ─────────────────────────────────────────────────────────
export type {
  ExperienceRecord,
  ExperienceStore,
  ExperienceQuery,
  ExperienceOutcome,
} from "./core/experience/record.js";

// ── Intelligence / model layer ────────────────────────────────────────────────
export { ModelRouter } from "./intelligence/models/router.js";
export { AnthropicProvider } from "./intelligence/models/providers/anthropic-provider.js";
export { OllamaProvider } from "./intelligence/models/providers/ollama-provider.js";
export { MockModelProvider } from "./intelligence/models/providers/mock-provider.js";

export type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelMessage,
  ModelCapabilities,
  ModelDescriptor,
  ModelHealth,
} from "./intelligence/models/types.js";

// ── Agent system ──────────────────────────────────────────────────────────────
export { KairosAgent } from "./agents/agent.js";
export { AgentRegistry } from "./agents/identity.js";
export { AgentMessageBus } from "./agents/message-bus.js";
export { OrionAgent } from "./agents/research/orion-agent.js";
export { AtlasAgent } from "./agents/executive/atlas-agent.js";
export { SageAgent } from "./agents/knowledge/sage-agent.js";
export { PulseAgent } from "./agents/observation/pulse-agent.js";
export {
  createSmartStrategy,
  splitObjectiveIntoClauses,
} from "./agents/executive/decomposition.js";

export type {
  AgentIdentity,
  CreateAgentOptions,
} from "./agents/identity.js";

export type {
  KairosAgentOptions,
} from "./agents/agent.js";

export type {
  OrionAgentOptions,
} from "./agents/research/orion-agent.js";

export type {
  AtlasAgentOptions,
  OrchestrationOutcome,
} from "./agents/executive/atlas-agent.js";

export type {
  SageAgentOptions,
} from "./agents/knowledge/sage-agent.js";

export type {
  PulseAgentOptions,
  StatusReport,
} from "./agents/observation/pulse-agent.js";

export type {
  SmartSubTask,
} from "./agents/executive/decomposition.js";

// ── HTTP server ───────────────────────────────────────────────────────────────
export { createKairosServer } from "./server/http-server.js";

export type {
  KairosServerOptions,
} from "./server/http-server.js";

// ── Security ──────────────────────────────────────────────────────────────────
export { BasicAuthorizationEngine } from "./security/authorization/basic-engine.js";
export { AuthorizedActionGateway } from "./security/authorization/gateway.js";

export type {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationEngine,
} from "./security/authorization/types.js";