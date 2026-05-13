import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { verifyClaudeArtifacts } from './verify-claude-artifacts.mjs';

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixtureRoot() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-claude-artifacts-'));
  await writeJson(path.join(rootDir, 'packages', 'skill', 'llm-memory', 'package.json'), {
    name: '@ivkond-llm-wiki/skill-llm-memory',
    version: '0.0.0',
    private: true,
  });
  return rootDir;
}

test('test_verifyClaudeArtifacts_whenPolicySatisfied_passes', async () => {
  const rootDir = await createFixtureRoot();
  await verifyClaudeArtifacts(rootDir, {
    trackedFiles: [
      'README.md',
      'packages/skill/llm-memory/SKILL.md',
    ],
  });
});

test('test_verifyClaudeArtifacts_whenClaudeSettingsExists_rejects', async () => {
  const rootDir = await createFixtureRoot();
  const settingsPath = path.join(rootDir, '.claude', 'settings.json');
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, '{}\n');

  await assert.rejects(
    () => verifyClaudeArtifacts(rootDir),
    /Claude artifact must remain absent: \.claude\/settings\.json/,
  );
});

test('test_verifyClaudeArtifacts_whenTrackedHooksPresent_rejects', async () => {
  const rootDir = await createFixtureRoot();

  await assert.rejects(
    () =>
      verifyClaudeArtifacts(rootDir, {
        trackedFiles: ['.claude/hooks/beforePrompt.sh'],
      }),
    /Claude hook artifact must remain absent: \.claude\/hooks\/beforePrompt\.sh/,
  );
});

test('test_verifyClaudeArtifacts_whenSkillPackageNotPrivate_rejects', async () => {
  const rootDir = await createFixtureRoot();
  await writeJson(path.join(rootDir, 'packages', 'skill', 'llm-memory', 'package.json'), {
    name: '@ivkond-llm-wiki/skill-llm-memory',
    version: '0.0.0',
    private: false,
  });

  await assert.rejects(
    () => verifyClaudeArtifacts(rootDir),
    /packages\/skill\/llm-memory\/package\.json must remain private: true/,
  );
});
