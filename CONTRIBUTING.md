# Contributing to KAIROS

## Workflow

All changes follow:

Inspect ? Plan ? Implement ? Test ? Document ? Version ? Commit

## Branches

main
develop
feature/*
fix/*
research/*
experiment/*

## Commit Format

Use:

type: description

Examples:

feat: add model abstraction
fix: correct memory retrieval
docs: update architecture
test: add reasoning evaluation
security: restrict tool permissions
refactor: simplify cognition interface
chore: update dependencies

## Repository Synchronization

Every material change must synchronize:

- source
- tests
- documentation
- KAIROS_STATE.md
- CHANGELOG.md
- VERSION where applicable
- dependency records where applicable

## Architectural Changes

Create an ADR under:

docs/decisions/ADR/

before or alongside the implementation.

## Pull Requests

A pull request must explain:

- objective
- implementation
- tests
- security impact
- architectural impact
- version impact
- known limitations
