---
phase: 04-cli
plan: "01"
subsystem: cli
tags:
  - cli
  - commander
  - init
dependency_graph:
  requires: []
  provides:
    - CLI-01
    - CLI-02
    - CLI-03
    - CLI-04
    - CLI-05
    - CLI-06
  affects:
    - packages/cli
    - pnpm-workspace.yaml
    - tsconfig.json
tech_stack:
  added:
    - commander (^12.1.0)
  patterns:
    - commander subcommands for CLI
    - workspace monorepo integration
    - ESM module resolution
key_files:
  created:
    - packages/cli/package.json
    - packages/cli/tsconfig.json
    - packages/cli/src/index.ts
    - packages/cli/src/commands/index.ts
    - packages/cli/src/commands/init.ts
    - packages/cli/src/commands/ingest.ts
    - packages/cli/src/commands/lint.ts
    - packages/cli/src/commands/import-cmd.ts
    - packages/cli/src/commands/search.ts
    - packages/cli/src/commands/status.ts
  modified:
    - pnpm-workspace.yaml (implicit via packages/*)
    - tsconfig.json (added cli reference)
decisions:
  - "Switched from cliffy to commander due to npm availability issues"
  - "Used commander subcommands pattern for 6 CLI operations"
metrics:
  duration: "~30 min"
  completed_date: "2026-04-13"
---

# Phase 04 Plan 01: CLI Package Foundation

## Overview

Set up the CLI package foundation with commander framework, configuration loading, and command structure.

## What Was Built

- **CLI Package**: `@llm-wiki/cli` with commander framework
- **Commands**: 6 subcommands (init, ingest, lint, import, search, status)
- **Workspace Integration**: CLI added to pnpm workspace and tsconfig references
- **Build**: CLI package compiles successfully

## Implementation Details

### Package Structure

```
packages/cli/
├── package.json          # @llm-wiki/cli, commander dependency
├── tsconfig.json         # References core, infra, common
├── src/
│   ├── index.ts          # Main entry with 6 subcommands
│   └── commands/
│       ├── index.ts      # Command exports
│       ├── init.ts       # Initialize wiki directory
│       ├── ingest.ts     # Ingest content from source
│       ├── lint.ts       # Run lint operations
│       ├── import-cmd.ts # Import from external sources
│       ├── search.ts     # Search the wiki
│       └── status.ts     # Show wiki status
```

### Command Registration

Each command is a commander subcommand with proper options and arguments. Example: `llm-wiki init --force ~/.llm-wiki`

## Verification

- [x] CLI package builds without errors (`tsc -b packages/cli`)
- [x] `llm-wiki --help` displays 6 subcommands
- [x] `llm-wiki init --help` shows options

## Deviation

**Framework change**: cliffy → commander due to npm unavailability. Commander provides equivalent functionality with better package availability.

## Stub Tracking

All command handlers are stubs that log "not yet fully implemented" — full integration with services will be done in plan 04-02.

## Self-Check: PASSED

- All files created in correct locations
- Build succeeds
- CLI help output verified