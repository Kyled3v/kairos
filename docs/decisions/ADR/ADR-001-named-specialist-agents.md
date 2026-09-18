# ADR-001 — Named Specialist Agent Pattern (ORION)

## Status

Accepted

## Date

2026-09-18

## Context

The KAIROS roadmap (Phase 3) calls for named specialist agents — ORION,
ATLAS, NOVA, FORGE, SAGE, PULSE, VECTOR, VANGUARD — on top of the generic
agent infrastructure that already exists (KairosAgent, AgentRegistry,
AgentMessageBus, AgentCoordinator, AgentScopedMemoryStore, ToolRegistry /
ToolPolicy / ObservedToolGateway).

The generic infrastructure was complete but no named agent had been
instantiated. The first specialist chosen was ORION (research and discovery)
because it has the smallest security surface: it needs only read-only tools.

## Decision

Named specialist agents are implemented as **composition classes around
KairosAgent** (not subclasses) in `src/agents/<domain>/`, following the
pattern established by CodingAgent:

1. Register a stable identity in an AgentRegistry with role, specialty,
   capabilities and constraints metadata (Agent Contract,
   docs/architecture/agents.md).
2. Build a purpose-scoped ToolRegistry — the toolset itself enforces the
   agent's boundary (ORION registers only read-only tools).
3. Enforce the boundary a second time with a ToolPolicy configured to the
   agent's permissions, so tools registered after construction that exceed
   the boundary are still blocked at invocation.
4. Wrap the registry+policy in an ObservedToolGateway with a
   ToolCallCollector so every invocation is auditable and lands in the
   agent's experience records.
5. Pass a (possibly shared) MemoryStore; isolation comes from
   AgentScopedMemoryStore inside KairosAgent.
6. Expose domain-flavored methods (e.g. `research()`, `rememberFinding()`,
   `findings()`, `recordSessionSummary()`) over the generic run()/memory
   surface.

ORION additionally rejects any extra tool whose capabilities include
write-local, write-network or execute-shell at construction time.

## Amendment — 2026-09-18 (ATLAS)

ATLAS (executive) was instantiated as the second named agent following this
pattern, with two consequences folded back into the infrastructure:

1. **DelegatableAgent**: AgentCoordinator and SupervisorAgent were widened
   from `KairosAgent` to a structural `DelegatableAgent` interface
   (identity + run()). Specialist agents compose a KairosAgent rather than
   extend one, so structural typing lets them register with the coordinator
   directly — no inheritance, no wrapper adapters.
2. **Shared boundary helper**: ORION's local assertReadOnly was extracted to
   `src/agents/tool-boundary.ts` (assertNoWriteExecuteCapability) so ATLAS
   and future specialists reuse one boundary definition.

ATLAS delegates exclusively through AgentCoordinator; every delegation
returns a DelegationResult (failures are results, not exceptions) and is
recorded as ATLAS episodic memory. The executive holds only a minimal
read-only toolset — delegation does not transfer write/execute power.

The composition pattern has now repeated twice; the next agent (SAGE or
PULSE) should extract a shared SpecialistAgent factory if the boilerplate
remains identical a third time.

## Amendment — 2026-09-18 (smart decomposition)

ATLAS.orchestrate() no longer requires a caller-provided strategy. A
built-in deterministic strategy (src/agents/executive/decomposition.ts)
splits the objective into clauses (semicolons, newlines, "then", numbered
markers) and routes each clause to a registered worker by keyword→role
matching with per-role round-robin. Rules baked into the strategy:

- executive-role agents are never routed work (ATLAS does not delegate to
  itself); with no eligible workers the outcome is status "empty", not an
  error — decomposition is a planning aid, not an authorization change.
- routing uses identity metadata (role), so new specialists become
  automatically routable without touching ATLAS.
- the strategy is pure and deterministic: same workers + same objective →
  same plan (testable, auditable, reproducible).
- explicit caller strategies still take precedence; a "single" mode routes
  the whole objective to one worker.

A model-based decomposer (ModelGoalDecomposer) was considered for this
default but rejected for the basic mode: probabilistic decomposition inside
the executive would make orchestration results non-deterministic and harder
to audit. Model-based planning remains available through the existing model
pipeline stages.

## Alternatives Considered

- **Subclassing KairosAgent**: rejected — the project prefers composition
  and replaceable components; CodingAgent already established the wrapper
  pattern, and subclassing would leak orchestrator internals.
- **Model-level prompt constraints only** ("the model must not write"):
  rejected — prompt constraints are not a security boundary; the registry
  and policy are.
- **A generic "SpecialistAgent" configured by data**: deferred — with one
  specialist the abstraction is premature; the pattern is documented here so
  the next agents (ATLAS, SAGE, ...) can extract it if it repeats.

## Consequences

- Positive: specialists are immediately auditable (tool calls + experience
  records tagged with the agent id), isolated by construction, and safe to
  share a memory store.
- Positive: no new dependencies; uses only existing infrastructure.
- Negative: each new specialist re-writes the composition boilerplate until
  a shared factory is extracted (after 2–3 agents).
- Neutral: ORION in basic mode executes deterministic cycles with keyword
  tool selection; model mode is available via router/providerId/modelId.

## Security Considerations

- ORION has no write or execute capability: registry omission + policy
  block + constructor rejection (defence in depth).
- ToolPolicy caps ORION at public/restricted permissions and medium risk.
- All tool invocations flow through ObservedToolGateway and are recorded
  in experience records retrievable via `GET /experience?sessionId=orion`.
- Memory access is scoped by AgentScopedMemoryStore; ORION cannot read or
  write another agent's memories even over a shared store.

## Ownership/Licensing Considerations

No third-party dependencies were introduced. The ORION agent is original
KyleDev code owned by the KAIROS project.
