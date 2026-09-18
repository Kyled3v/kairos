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

FORGE
Software engineering and technical work.

SAGE
Knowledge, memory and information organization.

PULSE
Observation, monitoring and environmental awareness.

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
- explicit strategy: a caller-provided function from objective to sub-tasks,
  taking precedence over the built-in modes.

Delegation must preserve:

- authorization
- traceability
- context
- result attribution

## Agent Isolation

An agent must only access the tools, memory and data explicitly granted to it.

Agent specialization must never bypass security boundaries.
