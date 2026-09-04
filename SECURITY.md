# Security Policy

## Principle

Security is a core KAIROS architecture requirement.

## Never Commit

- API keys
- passwords
- tokens
- private keys
- database credentials
- production secrets
- personal sensitive data

## Tool Security

Every executable tool must define:

- identity
- authorization
- scope
- input validation
- output handling
- audit logging
- failure behavior

## Autonomous Actions

High-impact actions require explicit authorization according to the KAIROS policy engine.

## Vulnerabilities

Security issues should not be publicly disclosed before they are assessed and remediated.
