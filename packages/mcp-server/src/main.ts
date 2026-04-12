#!/usr/bin/env node
import { homedir } from 'node:os';
import { ConfigLoader } from '@llm-wiki/infra';
import { buildContainer } from '@llm-wiki/common';
import { startServer, type ServerHandle } from './server.js';
import { logInfo, logError } from './logger.js';

/**
 * CLI entry point for `llm-wiki-mcp`.
 *
 * Responsibilities — kept minimal on purpose (thin-transport invariant):
 * 1. Resolve wiki root from `LLM_WIKI_PATH` env (default `~/.llm-wiki`).
 * 2. Load WikiConfig via ConfigLoader (shared YAML + local YAML + env overrides).
 * 3. Build the service container.
 * 4. Start the HTTP listener on `config.mcp.{host,port}`.
 * 5. Install SIGINT / SIGTERM handlers for graceful shutdown (T-01-09).
 *
 * main.ts is the ONLY file in this package allowed to import `@llm-wiki/infra`.
 * `server.ts`, `tools/*` stay transport-pure.
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const wikiRoot = expandHome(process.env.LLM_WIKI_PATH ?? '~/.llm-wiki');
  const config = await new ConfigLoader(wikiRoot).load();
  const services = buildContainer(config);
  const handle = await startServer(services, {
    host: config.mcp.host,
    port: config.mcp.port,
  });
  logInfo(`listening on ${handle.url}`);

  installShutdown(handle);
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return homedir() + path.slice(1);
  }
  return path;
}

function installShutdown(handle: ServerHandle): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logInfo(`${signal} received, shutting down`);
    const timeout = setTimeout(() => {
      logError('shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    handle
      .close()
      .then(() => {
        clearTimeout(timeout);
        process.exit(0);
      })
      .catch((err: unknown) => {
        logError('graceful shutdown failed', err);
        clearTimeout(timeout);
        process.exit(1);
      });
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

main().catch((err: unknown) => {
  logError('fatal startup error', err);
  process.exit(1);
});
