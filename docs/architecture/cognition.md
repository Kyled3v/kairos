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

```text
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
@'
# KAIROS Cognitive Architecture

## Purpose

The cognitive layer coordinates how KAIROS transforms objectives into decisions and observable outcomes.

The cognitive system must remain independent from any specific model provider.

## Cognitive Cycle

GOAL
? UNDERSTAND
? REASON
? PLAN
? DECIDE
? ACT
? OBSERVE
? EVALUATE
? REFLECT

The cycle may repeat until:

- the objective is achieved
- the objective is impossible
- authorization is unavailable
- a safety policy prevents continuation
- a configured resource limit is reached
- a human terminates the task

## Cognitive State

A cognitive state contains:

- current goal
- active context
- observations
- reasoning results
- candidate plans
- selected decision
- executed actions
- action results
- evaluation
- reflection
- termination status

## Separation of Responsibilities

### Cognition

Coordinates the overall cognitive process.

### Reasoning

Produces conclusions and evaluates alternatives.

### Planning

Transforms objectives into executable steps.

### Decision

Selects an action or next cognitive operation.

### Action

Executes an authorized operation.

### Observation

Records what happened after an operation.

### Reflection

Evaluates the process and identifies lessons.

## Model Independence

The cognitive layer must never directly depend on a particular model provider.

Models are accessed through the KAIROS model abstraction.

## Human Governance

Actions must pass through authorization and policy controls before execution.

The cognitive engine may recommend an action without possessing permission to execute it.

## Determinism

The orchestration layer should be deterministic wherever possible.

Probabilistic behavior belongs inside explicitly defined intelligence components.
