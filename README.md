# KAIROS

<p align="center">
  <a href="https://github.com/Kyled3v/kairos/actions/workflows/ci.yml">
    <img src="https://github.com/Kyled3v/kairos/actions/workflows/ci.yml/badge.svg" alt="CI: Typecheck &amp; Test">
  </a>
</p>

**KyleDev Autonomous Intelligence & Reasoning Operating System**

KAIROS is a KyleDev-owned, AGI-oriented intelligence platform designed to understand objectives, reason across domains, acquire and retrieve knowledge, use tools, learn from experience, coordinate specialized agents, and operate under explicit security and human-governance controls.

## Project Status

Version: 0.1.0  
Phase: Foundation  
Repository status: Active development

## Core Principles

1. KAIROS must remain model-agnostic.
2. No single AI provider may become a permanent architectural dependency.
3. The KAIROS intelligence architecture belongs to KyleDev.
4. Every significant architectural decision must be documented.
5. Every capability must be testable and measurable.
6. Security and permissions are part of the architecture, not an afterthought.
7. Autonomous actions must be governed by explicit policies.
8. Repository state is the source of truth.
9. Documentation must remain synchronized with implementation.
10. KAIROS must be designed for progressive capability expansion toward general intelligence.

## Intelligence Architecture

KAIROS is composed of:

- Cognition
- Reasoning
- Planning
- Memory
- Knowledge
- Perception
- Learning
- Reflection
- Action
- Tool use
- Agent orchestration
- Evaluation
- Security and governance

## Agent System

Named specialist agents built on the generic KAIROS agent infrastructure. Each follows the same composition pattern (see `docs/decisions/ADR/ADR-001-named-specialist-agents.md`): scoped memory, observed tool gateway, experience auditing, and message-bus communication — so ATLAS can route work to any of them automatically.

| Agent | Role | Status | Toolset |
|---|---|---|---|
| **ATLAS** | Executive intelligence | ✅ Implemented | Read-only; delegates to specialists via `AgentCoordinator` |
| **ORION** | Research and discovery | ✅ Implemented | Read-only research tools (filesystem, data lookup, mock HTTP) |
| **SAGE** | Knowledge and memory | ✅ Implemented | Read-only source tools; semantic + procedural memory surface |
| **PULSE** | Observation and monitoring | ✅ Implemented | Read-only probes; graceful `operational / degraded / unreachable` reporting |
| **FORGE** | Engineering | ✅ Implemented | Read-only by default; `allowWrite` / `allowRunCommand` unlock gated write + allowlisted shell access |
| **NOVA** | Creation and synthesis | ✅ Implemented | Read-only source/reference tools; drafts and syntheses stored as memory, never files |
| **VECTOR** | Execution | ⏳ Planned | — |
| **VANGUARD** | Security and governance | ⏳ Planned | — |

Agent responsibilities may evolve as the architecture matures. Names do not define implementation boundaries.

### Delegation example

```ts
import { AtlasAgent, OrionAgent, ForgeAgent } from "@kyledev/kairos/sdk";

const atlas = new AtlasAgent();
atlas.addWorker(new OrionAgent());   // role: research
atlas.addWorker(new ForgeAgent());   // role: engineering

// No strategy function needed — smart decomposition routes by role:
const outcome = await atlas.orchestrate(
  "Research the auth flow; then implement the missing validation",
);
// outcome.decompositionMode === "smart"
// outcome.delegationResults routed to orion + forge by role keywords
```

## Evaluation

Per the Constitution (§9), claims of improvement must be supported by measurable evaluation. Reproducible evaluation suites live in `evals/`:

| Suite | Checks | Scope |
|---|---|---|
| `evals/agents/delegation.evaluation.test.ts` | E1–E9 | ATLAS → specialist delegation: routing correctness, failure-as-result, memory isolation, read-only enforcement |
| `evals/reasoning/reasoning.benchmark.test.ts` | R1–R7 | Reasoning engines: determinism, contract shape, confidence bounds, model failure surfacing |
| `evals/planning/planning.benchmark.test.ts` | P1–P8 | Planning + decomposition: determinism, plan consistency, JSON parsing, fallback behavior, role routing |
| `evals/memory/memory.benchmark.test.ts` | M1–M10 | Memory system: round-trips across the four types, type isolation, importance ordering, store contract |

Run the suites with `npm test -- evals`.

## Development Rule

No feature is complete until:

- implementation exists
- tests exist
- documentation is synchronized
- project state is updated
- dependencies are recorded
- version impact is assessed
- security impact is assessed
- changes are committed to Git

## Ownership

KAIROS is a KyleDev Software Systems project.

Third-party dependencies, models, datasets, and services must retain their respective licenses. KAIROS must not falsely claim ownership of third-party components.

## SDK

Import from `src/sdk.ts` (or `@kyledev/kairos/sdk` once published). Never import from internal paths directly — they are subject to change without notice.

### Factories

| Export | Description |
|---|---|
| `createKairos(config)` | Create a runtime or session orchestrator |
| `createKairosMemory(config)` | Create a typed memory facade (file or in-memory) |
| `createExperienceStore(config)` | Create an experience store (file or in-memory) |
| `createPipelineDependencies(config)` | Build pipeline dependencies for basic or model mode |

### Modes

```ts
// Basic (deterministic, no model)
createKairos({ mode: "basic" })

// Model-backed
createKairos({ mode: "model", router, providerId: "anthropic", modelId: "claude-sonnet-4-6" })

// Session (preferred — adds experience recording, tool collection, decomposition)
createKairos({ mode: "session", dependencies, session: { maxCycles: 10 } })
```

### Key interfaces

- `KairosOrchestrator` — single-cycle run
- `KairosMultiCycleOrchestrator` — bounded multi-cycle run with progress tracking
- `SessionOrchestrator` — session-scoped orchestrator with experience recording
- `Tool` / `ToolDefinition` — implement to add a custom tool
- `ModelProvider` — implement to add a custom model provider
- `MemoryStore` / `ExperienceStore` — implement to add custom persistence

### Public vs internal

The SDK exports interfaces, factories, and concrete classes that form stable boundaries. Internal engine classes (`BasicReasoningEngine`, `BasicPlanningEngine`, `ModelReasoningEngine`, etc.) are **not** exported from the SDK — use the factories to compose them.
