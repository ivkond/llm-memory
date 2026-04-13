#!/usr/bin/env node
/**
 * LLM Wiki CLI - Main entry point
 *
 * Provides command-line interface for wiki operations:
 * init, ingest, lint, import, search, status
 */
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { ingestCommand } from './commands/ingest.js';
import { lintCommand } from './commands/lint.js';
import { importCommand } from './commands/import-cmd.js';
import { searchCommand } from './commands/search.js';
import { statusCommand } from './commands/status.js';

void Command; // Type-only import for side effects

await new Command()
  .name('llm-wiki')
  .description('CLI for LLM Wiki operations')
  .version('0.1.0')
  .addCommand(initCommand)
  .addCommand(ingestCommand)
  .addCommand(lintCommand)
  .addCommand(importCommand)
  .addCommand(searchCommand)
  .addCommand(statusCommand)
  .parseAsync();
