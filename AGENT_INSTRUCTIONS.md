# Agent Development Instructions

You are modifying the KAIROS repository.

KAIROS is an AGI-oriented KyleDev Software Systems project.

## Before Making Changes

Always inspect:

1. README.md
2. KAIROS_CONSTITUTION.md
3. AGI_VISION.md
4. ARCHITECTURE.md
5. KAIROS_STATE.md
6. VERSION
7. relevant source files
8. relevant tests
9. relevant ADRs
10. dependency/license records

Never assume documentation is current without checking the repository.

## Implementation Rules

- Do not invent existing functionality.
- Do not delete functionality without explicit justification.
- Do not silently change architecture.
- Do not introduce unnecessary dependencies.
- Prefer replaceable components.
- Keep interfaces explicit.
- Keep security boundaries explicit.
- Keep external providers replaceable.
- Never expose secrets in source control.
- Never claim a feature works without testing it.

## After Changes

You must:

1. Run applicable tests.
2. Run validation.
3. Update documentation.
4. Update KAIROS_STATE.md.
5. Update CHANGELOG.md.
6. Update dependency records when dependencies change.
7. Create an ADR for architectural decisions.
8. Assess version impact.
9. Report incomplete work honestly.

## Definition of Done

A feature is not complete merely because code exists.

It is complete only when implementation, tests, documentation, security considerations, repository state and version impact are synchronized.
