# ADR 0001: TypeScript pnpm monorepo

- Status: accepted
- Date: 2026-08-13

## Context

Web, API, worker, generated bindings, and technical packages must evolve atomically while keeping
their executable boundaries clear.

## Decision

Use TypeScript throughout and pnpm workspaces with exact package versions and one lockfile. Shared
compiler, lint, format, build, and test commands live at the root.

## Consequences

Cross-component contract changes can be verified in one run and installs are deterministic.
Workspace imports require deliberate public package exports; unrelated code must not be moved into
shared packages merely for convenience.
