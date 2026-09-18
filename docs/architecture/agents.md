# KAIROS Agent Architecture

## Principle

Agents are specialized capabilities operating within KAIROS.

Agents are not independent uncontrolled systems.

## Executive Agent

ATLAS coordinates complex objectives and delegates work to specialized agents.

Status: IMPLEMENTED (see src/agents/executive/atlas-agent.ts and ADR-001).
ATLAS is a composition around KairosAgent with a minimal read-only toolset,
delegating to registered specialists exclusively through AgentCoordinator.
Every delegation returns an auditable DelegationResult and is recorded as
ATLAS episodic memory. Directives sent over the message bus are advisory —
workers keep their own authorization and tool policies.

## Specialist Agents

ORION
Research and discovery.

Status: IMPLEMENTED (see src/agents/research/orion-agent.ts and ADR-001).
ORION is instantiated as a composition around KairosAgent with a read-only
toolset (no write, no shell execution), a policy that blocks anything
forbidden even if registered later, scoped semantic memory for findings,
episodic memory for session summaries, and fully audited tool calls.

NOVA
Creation and synthesis.

Status: IMPLEMENTED (see src/agents/creation/nova-agent.ts and ADR-001).
NOVA composes KairosAgent with a read-only source and reference toolset
(read-file, list-directory, search-code, data-lookup, mock-http,
calculator, date-time). Its output is memory, never files: drafts and
syntheses are stored as scoped semantic memories and creation session
summaries as episodic memory. Write/execute tools are rejected at
construction and blocked by policy afterwards.

FORGE
Software engineering and technical work.

Status: IMPLEMENTED (see src/agents/engineering/forge-agent.ts and ADR-001).
FORGE is the first specialist with write/execute capability, and that power
is explicitly gated: the default toolset is read-only; "write-local" requires
allowWrite: true and "execute-shell" requires allowRunCommand: true (the
run-command tool itself only executes its strict command allowlist).
extraTools carrying capabilities beyond the granted set are rejected at
construction, and the policy blocks forbidden tools even if registered later.
Engineering notes land in scoped semantic memory, build summaries in
episodic memory, and every tool call is audited.

SAGE
Knowledge, memory and information organization.

Status: IMPLEMENTED (see src/agents/knowledge/sage-agent.ts and ADR-001).
SAGE composes KairosAgent with a read-only source toolset, storing facts as
semantic memory, procedures as procedural memory and ingest sessions as
episodic memory — all inside its own scoped view.

PULSE
Observation, monitoring and environmental awareness.

Status: IMPLEMENTED (see src/agents/observation/pulse-agent.ts and ADR-001).
PULSE composes KairosAgent with lightweight read-only probes (no read-file —
it observes structure, not contents), reports status via checkStatus(), and
records observations as scoped episodic memory. Probes degrade gracefully:
a failed probe yields a degraded/unreachable report, never an exception.

VECTOR
Authorized execution and operational tasks.

VANGUARD
Security, governance and policy enforcement.

## Agent Contract

Every agent should eventually expose:

- identity
- capabilities
- goals
- constraints
- tools
- permissions
- input schema
- output schema
- memory access
- evaluation metrics
- audit information

## Delegation

ATLAS may delegate work when specialization improves:

- accuracy
- efficiency
- reliability
- parallelism

Decomposition modes (implemented in AtlasAgent.orchestrate):

- smart (default): deterministic clause splitting plus keyword-to-role
  routing across registered workers; no caller strategy required.
- single: the whole objective routed to one eligible worker.
- model: ModelGoalDecomposer proposes sub-goals; the deterministic
  role router assigns workers (with smart-mode fallback when the model
  is unavailable or output is invalid).
- explicit strategy: a caller-provided function from objective to sub-tasks,
  taking precedence over the built-in modes.

Reproducible evaluation suites cover the delegation flow (evals/agents),
the reasoning engines (evals/reasoning), the planning pipeline
(evals/planning) and the memory system (evals/memory) — see the README
Evaluation section.

Delegation must preserve:

- authorization
- traceability
- context
- result attribution

## Agent Isolation

An agent must only access the tools, memory and data explicitly granted to it.

Agent specialization must never bypass security boundaries.
