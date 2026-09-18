# Changelog

All notable KAIROS changes are recorded here.

## [0.1.0] - 2026-09-04

### Added

- Initial KAIROS repository
- Foundation directory architecture
- Git version control
- Project constitution
- AGI vision
- Architecture specification
- Agent development instructions
- Living project state## [0.1.0] - 2026-09-18 (batch 6)

### Added

- Full-roster evaluation suite (evals/agents/roster.evaluation.test.ts,
  F1–F8): all eight named agents scored together — roster registration,
  per-role routing coverage, executive exclusion, memory isolation over
  one shared store, the read-only vs gated privilege spectrum, per-agent
  experience audit trails, and full-roster orchestration.
- Generalization benchmark suite (evals/generalization/
  generalization.benchmark.test.ts, G1–G7): unseen-objective decomposition,
  paraphrase routing stability, zero-touch routing scaling, cross-domain
  knowledge transfer, role-metadata routing over renamed agents, monotonic
  capability with growing rosters, and graceful out-of-distribution
  degradation (never throws).
- Phase 4 web console skeleton (web/index.html + web/README.md): objective
  composer posting to POST /run with graceful offline degradation,
  streaming-style aria-live activity log, agent roster panel, system
  status strip, mobile-first bottom nav with hash deep links, reduced-
  motion and focus-visible support.
- Persisted KAIROS design system (design-system/kairos/MASTER.md)
  generated with the ui-ux-pro-max skill: AI-Native UI style, Inter
  typography, AI purple/cyan palette, light and dark token sets, dense
  dashboard spacing — governing web, desktop (VS Code) and future mobile
  surfaces.

### Changed

- ROADMAP: Phase 4 web interface marked skeleton-complete; Phase 5
  generalization research checked.

## [0.1.0] - 2026-09-18 (batch 5)

### Added

- VECTOR specialist agent (authorized execution) — seventh named agent:
  verification probes by default, gated and confined run-command (via
  createRunCommandTool with workingRoot), gated write-file, and
  ActionRequests routed through AuthorizedActionGateway with deny-by-
  default authorization. Execution outcomes recorded as episodic memory.
  Exported from the public SDK as VectorAgent.
- VANGUARD specialist agent (security and governance) — eighth named
  agent and the roster's completion: read-only inspection tools,
  screenTool() policy screening, deny-by-default governance
  authorization with a configurable allowlist, complianceReview() batch
  audits, and findings as scoped semantic memory. Exported from the
  public SDK as VanguardAgent.
- Knowledge pipeline (src/core/knowledge/pipeline.ts) completing the
  Phase 2 remainder: BasicSourceValidator (trusted domains, minimum
  length, prompt-injection pattern rejection), KnowledgePipeline with
  validating deduplicating ingestion, importance-ranked retrieval,
  per-topic ingestion history, and an ownerAgentId option that feeds a
  named specialist's scoped memory (SAGE integration tested). Exported
  from the public SDK.
- "execution" role added to the ATLAS smart-strategy keyword table
  (execute/run/deploy/release/operate/rollout/provision) so VECTOR is
  automatically routable.

### Changed

- ROADMAP Phase 3 agent roster complete (all eight named agents checked).

## [0.1.0] - 2026-09-18 (batch 4)

### Added

- NOVA specialist agent (creation and synthesis) — sixth named agent:
  read-only source/reference toolset, drafts and syntheses as scoped
  semantic memories, creation session summaries as episodic memory.
  NOVA's output is memory, never files. Exported from the public SDK as
  NovaAgent.
- Memory benchmark suite (evals/memory/memory.benchmark.test.ts, M1–M10):
  round-trips for all four memory types, type isolation, limit and
  importance-ordering semantics, store contract (get/delete/clear), and
  shared-store scoping documentation.
- createRunCommandTool(options) factory: workingRoot confinement (cwd
  must resolve inside the root; missing cwd defaults to the root;
  traversal and non-absolute paths rejected), configurable allowlist
  subset and timeoutMs. The default runCommandTool keeps backward
  compatibility.

### Changed

- run-command tool hardened: shell-operator rejection (command chaining,
  pipes, redirection, command substitution, backticks, newline injection)
  runs before the allowlist check so injected commands report their true
  failure reason. Version bumped to 2.0.0.

## [0.1.0] - 2026-09-18 (batch 3)

### Added

- FORGE specialist agent (engineering) — fifth named agent and the first with
  write/execute capability, gated behind explicit flags: read-only by default,
  allowWrite unlocks write-file, allowRunCommand unlocks the allowlisted
  run-command tool. extraTools exceeding the granted access level are rejected
  at construction; the policy blocks forbidden tools even if registered later.
  Exported from the public SDK as ForgeAgent.
- Reasoning benchmark suite (evals/reasoning/reasoning.benchmark.test.ts,
  R1–R7): engine determinism, contract shape, confidence bounds, router
  wiring, and model-failure surfacing.
- Planning benchmark suite (evals/planning/planning.benchmark.test.ts,
  P1–P8): plan determinism/consistency, model JSON parsing and fallback,
  goal decomposition invariants, and smart-strategy role routing.
- README polish: CI badge, agent-roster status table with per-agent toolsets,
  delegation example, and an Evaluation section indexing the evals/ suites.

## [0.1.0] - 2026-09-18
### Added

- ORION specialist agent (research and discovery) — first named agent on the
  generic agent infrastructure: read-only research toolset, policy-enforced
  permissions, scoped semantic memory for findings, episodic session history,
  audited tool calls via ToolCallCollector (ADR-001). Exported from the
  public SDK as OrionAgent.
- ATLAS specialist agent (executive) — coordinates objectives and delegates
  to specialists via AgentCoordinator: auditable DelegationResults, an
  orchestrate() aggregator (complete/partial/failed/empty status), directives
  over the message bus, objectives as semantic memory and delegation outcomes
  as episodic memory. Exported from the public SDK as AtlasAgent.
- AgentCoordinator and SupervisorAgent now accept any structural
  DelegatableAgent (KairosAgent or specialist composition agents).
- Shared assertNoWriteExecuteCapability tool-boundary helper and
  DelegatableAgent type in src/agents/tool-boundary.ts.
- PULSE specialist agent (observation and monitoring) — fourth named agent:
  lightweight read-only probes, checkStatus() reporting (operational/degraded/
  unreachable, never throws), observations as scoped episodic memory.
  Exported from the public SDK as PulseAgent.
- Delegation-flow evaluation suite (evals/agents/delegation.evaluation.test.ts)
  per Constitution section 9: nine scored checks covering correct routing,
  failure-as-result semantics, executive exclusion, role-appropriate routing
  across the roster, model-mode fallback, audit trails, memory-scope
  isolation, and read-only toolset enforcement.
- SAGE specialist agent (knowledge and memory) — third named agent on the
  generic infrastructure: read-only source toolset, learnFact/learnProcedure
  (semantic + procedural memory), batch ingest with episodic session records,
  policy-enforced boundaries. Exported from the public SDK as SageAgent.
- Model-backed decomposition: AtlasAgent.orchestrate(decomposition: "model")
  proposes sub-goals via ModelGoalDecomposer and routes them deterministically
  by role; falls back to the smart strategy whenever the model is unavailable
  or returns its Understand/Plan/Execute fallback template. Outcomes now
  report which decompositionMode produced the plan. Exported from the SDK as
  createModelStrategy.
- Smart orchestrator strategy: AtlasAgent.orchestrate() now decomposes
  objectives without a caller-provided function — deterministic clause
  splitting (semicolons/newlines/"then"/numbered items) plus keyword→role
  routing across registered workers (round-robin per role), with an
  optional "single" mode. Explicit strategies still take precedence
  (src/agents/executive/decomposition.ts, exported from the SDK).
- AgentCoordinator.listAgents() exposing registered agents for strategy
  construction.
- KairosAgent: additive `toolCallCollector` option so specialist agents
  record tool invocations into experience records without unsafe casts.
- ADR-001 documenting the named specialist agent composition pattern.

### Fixed

- HTTP server: GET /experience/analyse was unreachable because the
  /experience/:id route pattern shadowed it; analyse is now matched first.
- HTTP server: restored a corrupted line in the analyse handler that broke
  the TypeScript build (typecheck now passes cleanly).

### Changed

- Synchronized KAIROS_STATE.md and ROADMAP.md with the actual implemented
  state (cognitive runtime, model abstraction, memory, tools, security,
  HTTP API, SDK are implemented; documentation previously claimed otherwise).
- Removed stray dump/output artifacts from the repository and added ignore
  patterns for them.
