import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  loadReleaseManifests,
  validatePackedContract,
  validatePublishManifests,
  validatePublishSet,
  validateReleaseManifestNames,
  validateUndeclaredRuntimeImports,
  validateWorkspaceDependencyLeakage,
} from './verify-release-artifacts.mjs';

const validManifest = {
  name: '@ivkond-llm-wiki/cli',
  version: '1.2.3',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  files: ['dist'],
  bin: {
    'llm-wiki': 'dist/index.js',
  },
  exports: {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  },
  dependencies: {
    commander: '^12.1.0',
  },
};

const validPackedFiles = ['package/package.json', 'package/dist/index.js', 'package/dist/index.d.ts'];

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test('test_validateReleaseManifestNames_whenManifestNameDoesNotMatch_throws', () => {
  const manifests = new Map([
    ['mcp-server', { name: '@ivkond-llm-wiki/server' }],
  ]);

  assert.throws(() => validateReleaseManifestNames(manifests), /Release package name mismatch/);
});

test('test_validatePublishSet_whenPublishPackageOutsideReleaseSet_throws', () => {
  assert.throws(
    () =>
      validatePublishSet({
        publishPackages: ['cli', 'unknown'],
        releasePackages: ['core', 'infra', 'common', 'cli', 'mcp-server'],
        nonReleasePackages: ['packages/skill/llm-memory'],
      }),
    /not part of the release package set/,
  );
});

test('test_validatePublishSet_whenPrivatePackageLeaksIntoPublishSet_throws', () => {
  assert.throws(
    () =>
      validatePublishSet({
        publishPackages: ['cli', 'skill/llm-memory'],
        releasePackages: ['core', 'infra', 'common', 'cli', 'mcp-server', 'skill/llm-memory'],
        nonReleasePackages: ['packages/skill/llm-memory'],
      }),
    /Private workspace package is incorrectly included in release set/,
  );
});

test('test_validatePublishManifests_whenPublishPackagePrivate_throws', () => {
  const manifests = new Map([
    [
      'cli',
      {
        name: '@ivkond-llm-wiki/cli',
        private: true,
        publishConfig: { access: 'public' },
      },
    ],
  ]);

  assert.throws(() => validatePublishManifests(manifests, ['cli']), /must not be private/);
});

test('test_validatePublishManifests_whenPublicAccessMissing_throws', () => {
  const manifests = new Map([
    [
      'cli',
      {
        name: '@ivkond-llm-wiki/cli',
        publishConfig: { access: 'restricted' },
      },
    ],
  ]);

  assert.throws(() => validatePublishManifests(manifests, ['cli']), /publishConfig.access to public/);
});

test('test_validateWorkspaceDependencyLeakage_whenWorkspaceVersionPresent_throws', () => {
  assert.throws(
    () => validateWorkspaceDependencyLeakage({ dependencies: { '@ivkond-llm-wiki/core': 'workspace:*' } }),
    /workspace dependency/,
  );
});

test('test_validatePackedContract_whenDeclarationTargetMissing_throws', () => {
  const sourceManifest = {
    ...validManifest,
    types: './dist/missing.d.ts',
    exports: {
      '.': {
        types: './dist/missing.d.ts',
        import: './dist/index.js',
      },
    },
  };

  assert.throws(
    () =>
      validatePackedContract({
        packageDir: 'cli',
        sourceManifest,
        packedManifest: sourceManifest,
        packedFiles: validPackedFiles,
      }),
    /missing types target|missing declaration target/,
  );
});

test('test_validatePackedContract_whenBinTargetMissing_throws', () => {
  const sourceManifest = {
    ...validManifest,
    bin: {
      'llm-wiki': 'dist/cli.js',
    },
  };

  assert.throws(
    () =>
      validatePackedContract({
        packageDir: 'cli',
        sourceManifest,
        packedManifest: sourceManifest,
        packedFiles: validPackedFiles,
      }),
    /missing bin target/,
  );
});

test('test_validateUndeclaredRuntimeImports_whenImportNotInManifestDependencies_throws', () => {
  const packedManifest = {
    name: '@ivkond-llm-wiki/cli',
    dependencies: {
      commander: '^12.1.0',
    },
  };

  const jsFiles = {
    'package/dist/index.js': "import kleur from 'kleur';\nimport { readFile } from 'node:fs/promises';",
  };

  assert.throws(
    () =>
      validateUndeclaredRuntimeImports({
        packageName: packedManifest.name,
        packedManifest,
        jsFiles,
      }),
    /undeclared runtime imports/,
  );
});

test('test_validateUndeclaredRuntimeImports_whenSideEffectImportIsUndeclared_throws', () => {
  const packedManifest = {
    name: '@ivkond-llm-wiki/cli',
    dependencies: {},
  };

  const jsFiles = {
    'package/dist/index.js': "import 'left-pad';\n",
  };

  assert.throws(
    () =>
      validateUndeclaredRuntimeImports({
        packageName: packedManifest.name,
        packedManifest,
        jsFiles,
      }),
    /undeclared runtime imports/,
  );
});

test('test_loadReleaseManifests_whenReleasePackageDirectoryMissing_throws', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-release-manifests-'));
  await writeJson(path.join(rootDir, 'packages', 'core', 'package.json'), {
    name: '@ivkond-llm-wiki/core',
    version: '1.2.3',
  });

  await assert.rejects(
    () => loadReleaseManifests(rootDir, ['core', 'infra']),
    /Release package directory is missing: packages\/infra/,
  );
});

test('test_loadReleaseManifests_whenReleasePackageManifestExists_returnsManifestMap', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-release-manifests-'));
  await writeJson(path.join(rootDir, 'packages', 'core', 'package.json'), {
    name: '@ivkond-llm-wiki/core',
    version: '1.2.3',
  });
  await writeJson(path.join(rootDir, 'packages', 'mcp-server', 'package.json'), {
    name: '@ivkond-llm-wiki/mcp-server',
    version: '1.2.3',
  });

  const manifests = await loadReleaseManifests(rootDir, ['core', 'mcp-server']);
  assert.equal(manifests.get('core')?.name, '@ivkond-llm-wiki/core');
  assert.equal(manifests.get('mcp-server')?.name, '@ivkond-llm-wiki/mcp-server');
  assert.doesNotThrow(() => validateReleaseManifestNames(manifests));
});

test('test_validatePackedContract_whenContractIsValid_passes', () => {
  assert.doesNotThrow(() =>
    validatePackedContract({
      packageDir: 'cli',
      sourceManifest: validManifest,
      packedManifest: validManifest,
      packedFiles: validPackedFiles,
    }),
  );
});
