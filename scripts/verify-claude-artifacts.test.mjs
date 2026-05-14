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

async function createBaseFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-claude-artifacts-'));

  await writeJson(path.join(rootDir, 'packages', 'skill', 'llm-memory', 'package.json'), {
    name: '@ivkond-llm-wiki/skill-llm-memory',
    version: '0.0.0',
    private: true,
    files: ['SKILL.md', 'README.md', 'templates/'],
  });

  await mkdir(path.join(rootDir, '.github', 'workflows'), { recursive: true });
  await writeFile(
    path.join(rootDir, '.github', 'workflows', 'release.yml'),
    ['name: Release', 'jobs:', '  release:', '    steps:', '      - run: echo "ok"', ''].join('\n'),
  );

  return rootDir;
}

test('test_verifyClaudeArtifacts_whenPolicySatisfied_passes', async () => {
  const rootDir = await createBaseFixture();

  await assert.doesNotReject(() => verifyClaudeArtifacts(rootDir));
});

test('test_verifyClaudeArtifacts_whenClaudeHookArtifactPresent_fails', async () => {
  const rootDir = await createBaseFixture();
  await mkdir(path.join(rootDir, '.claude', 'hooks', 'subdir'), { recursive: true });
  await writeFile(
    path.join(rootDir, '.claude', 'hooks', 'subdir', 'post-tool-use.sh'),
    '#!/usr/bin/env bash\n',
  );

  await assert.rejects(
    () => verifyClaudeArtifacts(rootDir),
    /Unexpected Claude artifact present: \.claude\/hooks\/subdir\/post-tool-use\.sh/,
  );
});

test('test_verifyClaudeArtifacts_whenClaudeSettingsArtifactPresent_fails', async () => {
  const rootDir = await createBaseFixture();
  await mkdir(path.join(rootDir, '.claude'), { recursive: true });
  await writeFile(path.join(rootDir, '.claude', 'settings.json'), '{}\n');

  await assert.rejects(
    () => verifyClaudeArtifacts(rootDir),
    /Unexpected Claude artifact present: \.claude\/settings\.json/,
  );
});

test('test_verifyClaudeArtifacts_whenClaudeSkillArtifactPresent_fails', async () => {
  const rootDir = await createBaseFixture();
  await mkdir(path.join(rootDir, '.claude', 'skills', 'wiki'), { recursive: true });
  await writeFile(path.join(rootDir, '.claude', 'skills', 'wiki', 'SKILL.md'), '# skill\n');

  await assert.rejects(
    () => verifyClaudeArtifacts(rootDir),
    /Unexpected Claude artifact present: \.claude\/skills\/wiki\/SKILL\.md/,
  );
});

test('test_verifyClaudeArtifacts_whenSkillPackageNotPrivate_fails', async () => {
  const rootDir = await createBaseFixture();

  await writeJson(path.join(rootDir, 'packages', 'skill', 'llm-memory', 'package.json'), {
    name: '@ivkond-llm-wiki/skill-llm-memory',
    version: '0.0.0',
    private: false,
    files: ['SKILL.md', 'README.md', 'templates/'],
  });

  await assert.rejects(
    () => verifyClaudeArtifacts(rootDir),
    /packages\/skill\/llm-memory\/package\.json must keep "private": true/,
  );
});

test('test_verifyClaudeArtifacts_whenReleaseWorkflowIncludesSkillPackage_fails', async () => {
  const rootDir = await createBaseFixture();

  await writeFile(
    path.join(rootDir, '.github', 'workflows', 'release.yml'),
    ['name: Release', 'jobs:', '  release:', '    steps:', '      - run: publish_package packages/skill/llm-memory', ''].join('\n'),
  );

  await assert.rejects(
    () => verifyClaudeArtifacts(rootDir),
    /Release workflow must not pack or publish packages\/skill\/llm-memory/,
  );
});
