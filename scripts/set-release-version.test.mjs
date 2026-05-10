import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { RELEASE_PACKAGES, setReleaseVersion } from './set-release-version.mjs';

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

test('test_setReleaseVersion_whenReleaseTagVersionProvided_updatesAllReleasePackagesOnly', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-release-version-'));
  await writeJson(path.join(rootDir, 'package.json'), {
    name: 'llm-wiki',
    private: true,
  });

  for (const packageName of RELEASE_PACKAGES) {
    await writeJson(path.join(rootDir, 'packages', packageName, 'package.json'), {
      name: `@ivkond-llm-wiki/${packageName}`,
      version: '0.1.0',
      dependencies: {
        '@ivkond-llm-wiki/core': 'workspace:*',
      },
    });
  }

  await setReleaseVersion(rootDir, '1.2.3');

  for (const packageName of RELEASE_PACKAGES) {
    const packageJson = await readJson(path.join(rootDir, 'packages', packageName, 'package.json'));
    assert.equal(packageJson.version, '1.2.3');
    assert.deepEqual(packageJson.dependencies, {
      '@ivkond-llm-wiki/core': 'workspace:*',
    });
  }

  const rootPackageJson = await readJson(path.join(rootDir, 'package.json'));
  assert.deepEqual(rootPackageJson, {
    name: 'llm-wiki',
    private: true,
  });
});

test('test_setReleaseVersion_whenVersionIsNotSemver_rejectsWithoutChangingPackageJson', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-release-version-'));
  const packageJsonPath = path.join(rootDir, 'packages', 'core', 'package.json');
  await writeJson(packageJsonPath, {
    name: '@ivkond-llm-wiki/core',
    version: '0.1.0',
  });

  await assert.rejects(
    () => setReleaseVersion(rootDir, 'v1.2.3'),
    /Release version must match X\.Y\.Z/,
  );

  const packageJson = await readJson(packageJsonPath);
  assert.equal(packageJson.version, '0.1.0');
});
