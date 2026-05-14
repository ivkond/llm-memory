/**
 * CLI Commands - Re-exports all command modules
 *
 * Each command is a cliffy Command object that can be registered
 * as a subcommand in the main CLI.
 */
export { initCommand } from './init.js';
export { ingestCommand } from './ingest.js';
export { lintCommand } from './lint.js';
export { importCommand } from './import-cmd.js';
export { searchCommand } from './search.js';
export { statusCommand } from './status.js';
export { skillCommand } from './skill.js';
export { doctorCommand } from './doctor.js';
export { verifyStateCommand } from './verify-state.js';
export { repairIndexCommand } from './repair-index.js';

/**
 * CommandModule type for cliffy subcommands
 */
export type CommandModule = {
  readonly name: string;
  readonly description: string;
};
