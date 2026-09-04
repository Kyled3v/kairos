# Cognitive Loop Specification

Version: 0.1.0

## Objective

Define the minimum executable cognitive cycle for KAIROS.

## States

A cognitive task moves through these states:

1. GOAL
2. UNDERSTAND
3. REASON
4. PLAN
5. DECIDE
6. ACT
7. OBSERVE
8. EVALUATE
9. REFLECT
10. COMPLETE

## State Transition

GOAL
  ?
UNDERSTAND
  ?
REASON
  ?
PLAN
  ?
DECIDE
  ?
ACT
  ?
OBSERVE
  ?
EVALUATE
  ?
REFLECT
  +-- continue ? UNDERSTAND
  +-- complete ? COMPLETE

## Termination Conditions

A task terminates when:

- objective is achieved
- task is impossible
- policy blocks execution
- authorization is unavailable
- resource limits are exceeded
- human intervention is required

## Cognitive Cycle Contract

Each cycle must produce an inspectable state transition.

The runtime must be able to determine:

- what the system was trying to achieve
- what it knew
- what it considered
- what it decided
- what it did
- what happened
- why the task continued or stopped

## Safety

The cognitive loop cannot directly bypass authorization.

All executable actions must eventually pass through the KAIROS action and security layers.

## Future Capability

This specification is implementation-independent.

Future implementations may introduce:

- model-based reasoning
- memory retrieval
- tool selection
- planning algorithms
- reflection
- learning
- multi-agent delegation
