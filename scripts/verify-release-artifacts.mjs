import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  NON_RELEASE_PACKAGES,
  PUBLISH_PACKAGES,
  RELEASE_PACKAGES,
  getExpectedPackageName,
  getReleasePackagePath,
} from './release-metadata.mjs';

const ALLOWED_COMMANDS = new Set(['pnpm', 'corepack', 'tar']);

function assertSafeCommand(command, args) {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`Unsupported command: ${command}`);
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new Error(`Invalid command arguments for ${command}`);
  }
}

function executeCommand(command, args, options) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function runCommand(command, args, options = {}) {
  assertSafeCommand(command, args);

  let result = executeCommand(command, args, options);

  if (result.error && result.error.code === 'ENOENT' && command === 'pnpm') {
    result = executeCommand('corepack', ['pnpm', ...args], options);
  }

  if (result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`Command failed: ${command} ${args.join(' ')}${output ? `\n${output}` : ''}`);
  }

  return result.stdout.trim();
}

export function parseWorkspaceGlobs(workspaceYaml) {
  return workspaceYaml
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim().replace(/^['"]|['"]$/g, ''));
}

function pathMatchesSingleSegmentGlob(targetPath, glob) {
  const targetSegments = targetPath.split('/');
  const globSegments = glob.split('/');
  if (targetSegments.length !== globSegments.length) {
    return false;
  }

  return globSegments.every((globSegment, index) => {
    if (globSegment === '*') {
      return true;
    }
    return globSegment === targetSegments[index];
  });
}

export function validateReleasePackageLayout({ releasePackages, workspaceGlobs }) {
  const missing = [];
  for (const packageDir of releasePackages) {
    const relativePath = `packages/${packageDir}`;
    const covered = workspaceGlobs.some((glob) => pathMatchesSingleSegmentGlob(relativePath, glob));
    if (!covered) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Release packages missing from pnpm-workspace.yaml globs: ${missing.join(', ')}`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function loadReleaseManifests(rootDir, releasePackages = RELEASE_PACKAGES) {
  const manifests = new Map();
  for (const packageDir of releasePackages) {
    const packagePath = getReleasePackagePath(rootDir, packageDir);
    if (!existsSync(packagePath)) {
      throw new Error(`Release package directory is missing: ${path.relative(rootDir, packagePath)}`);
    }

    const manifestPath = path.join(packagePath, 'package.json');
    manifests.set(packageDir, await readJson(manifestPath));
  }
  return manifests;
}

export function validateReleaseManifestNames(manifests) {
  for (const [packageDir, manifest] of manifests.entries()) {
    const expectedName = getExpectedPackageName(packageDir);
    if (manifest.name !== expectedName) {
      throw new Error(
        `Release package name mismatch for ${packageDir}: expected ${expectedName}, got ${manifest.name}`,
      );
    }
  }
}

export function validatePublishSet({ publishPackages, releasePackages, nonReleasePackages }) {
  for (const packageDir of publishPackages) {
    if (!releasePackages.includes(packageDir)) {
      throw new Error(`Publish package ${packageDir} is not part of the release package set`);
    }
  }

  const releasePaths = new Set(releasePackages.map((packageDir) => `packages/${packageDir}`));
  for (const privatePath of nonReleasePackages) {
    if (releasePaths.has(privatePath)) {
      throw new Error(`Private workspace package is incorrectly included in release set: ${privatePath}`);
    }
  }

  for (const packageDir of publishPackages) {
    const candidatePath = `packages/${packageDir}`;
    if (nonReleasePackages.includes(candidatePath)) {
      throw new Error(`Private workspace package is incorrectly included in publish set: ${candidatePath}`);
    }
  }
}

export function validatePublishManifests(manifests, publishPackages = PUBLISH_PACKAGES) {
  for (const packageDir of publishPackages) {
    const manifest = manifests.get(packageDir);
    if (!manifest) {
      throw new Error(`Missing manifest for publish package: ${packageDir}`);
    }

    if (manifest.private === true) {
      throw new Error(`Publish package ${manifest.name} must not be private`);
    }

    if (manifest.publishConfig?.access !== 'public') {
      throw new Error(`Publish package ${manifest.name} must set publishConfig.access to public`);
    }
  }
}

export function validateWorkspaceDependencyLeakage(packedManifest) {
  const dependencyKeys = [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ];

  for (const key of dependencyKeys) {
    const deps = packedManifest[key] ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string' && version.includes('workspace:')) {
        throw new Error(`Packed artifact contains workspace dependency ${name}@${version}`);
      }
    }
  }
}

function collectTypeTargets(exportsField, collector) {
  if (!exportsField) {
    return;
  }
  if (typeof exportsField === 'string') {
    return;
  }
  if (Array.isArray(exportsField)) {
    for (const value of exportsField) {
      collectTypeTargets(value, collector);
    }
    return;
  }
  if (typeof exportsField === 'object') {
    if (typeof exportsField.types === 'string') {
      collector.add(exportsField.types);
    }
    for (const value of Object.values(exportsField)) {
      collectTypeTargets(value, collector);
    }
  }
}

function normalizePackPath(filePath) {
  return `package/${filePath.replace(/^\.\//, '')}`;
}

function ensureTargetInPack(packedFilesSet, targetPath, errorPrefix) {
  const normalized = normalizePackPath(targetPath);
  if (!packedFilesSet.has(normalized)) {
    throw new Error(`${errorPrefix}: ${targetPath}`);
  }
}

export function validatePackedContract({ packageDir, sourceManifest, packedManifest, packedFiles }) {
  if (sourceManifest.name !== packedManifest.name) {
    throw new Error(`Packed artifact name mismatch for ${packageDir}`);
  }

  if (sourceManifest.version !== packedManifest.version) {
    throw new Error(`Packed artifact version mismatch for ${packageDir}`);
  }

  const scalarFields = ['main', 'types'];
  for (const field of scalarFields) {
    if (sourceManifest[field] !== undefined && sourceManifest[field] !== packedManifest[field]) {
      throw new Error(`Packed artifact ${field} mismatch for ${packageDir}`);
    }
  }

  if (JSON.stringify(sourceManifest.bin ?? null) !== JSON.stringify(packedManifest.bin ?? null)) {
    throw new Error(`Packed artifact bin mismatch for ${packageDir}`);
  }

  if (JSON.stringify(sourceManifest.exports ?? null) !== JSON.stringify(packedManifest.exports ?? null)) {
    throw new Error(`Packed artifact exports mismatch for ${packageDir}`);
  }

  const packedFilesSet = new Set(packedFiles);

  if (typeof sourceManifest.main === 'string') {
    ensureTargetInPack(packedFilesSet, sourceManifest.main, `Packed artifact missing main target for ${packageDir}`);
  }

  if (typeof sourceManifest.types === 'string') {
    ensureTargetInPack(
      packedFilesSet,
      sourceManifest.types,
      `Packed artifact missing types target for ${packageDir}`,
    );
  }

  if (sourceManifest.bin && typeof sourceManifest.bin === 'object') {
    for (const binPath of Object.values(sourceManifest.bin)) {
      if (typeof binPath === 'string') {
        ensureTargetInPack(packedFilesSet, binPath, `Packed artifact missing bin target for ${packageDir}`);
      }
    }
  }

  const declarationTargets = new Set();
  if (typeof sourceManifest.types === 'string') {
    declarationTargets.add(sourceManifest.types);
  }
  collectTypeTargets(sourceManifest.exports, declarationTargets);
  for (const target of declarationTargets) {
    ensureTargetInPack(
      packedFilesSet,
      target,
      `Packed artifact missing declaration target for ${packageDir}`,
    );
  }

  const manifestFiles = Array.isArray(sourceManifest.files) ? sourceManifest.files : [];
  for (const fileEntry of manifestFiles) {
    if (typeof fileEntry !== 'string' || fileEntry.includes('*')) {
      continue;
    }
    const prefix = normalizePackPath(fileEntry).replace(/\/$/, '');
    const hasEntry = packedFiles.some((packFile) => packFile === prefix || packFile.startsWith(`${prefix}/`));
    if (!hasEntry) {
      throw new Error(`Packed artifact missing manifest files entry for ${packageDir}: ${fileEntry}`);
    }
  }
}

function extractPackageName(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function isIdentifierChar(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function isKeywordAt(source, index, keyword) {
  if (!source.startsWith(keyword, index)) {
    return false;
  }
  return !isIdentifierChar(source[index - 1] ?? '') && !isIdentifierChar(source[index + keyword.length] ?? '');
}

function skipWhitespace(source, index) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function skipLineComment(source, index) {
  let cursor = index + 2;
  while (cursor < source.length && source[cursor] !== '\n') {
    cursor += 1;
  }
  return cursor;
}

function skipBlockComment(source, index) {
  let cursor = index + 2;
  while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) {
    cursor += 1;
  }
  return cursor < source.length ? cursor + 2 : cursor;
}

function parseStringLiteral(source, index) {
  const quote = source[index];
  if (quote !== '\'' && quote !== '"') {
    return null;
  }

  let cursor = index + 1;
  let value = '';
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      const escaped = source[cursor + 1];
      if (escaped) {
        value += escaped;
      }
      cursor += 2;
      continue;
    }
    if (char === quote) {
      return { value, end: cursor + 1 };
    }
    value += char;
    cursor += 1;
  }

  return null;
}

function mergeSpecifiers(target, source) {
  for (const specifier of source) {
    target.add(specifier);
  }
}

function collectTemplateExpression(source, startIndex) {
  let cursor = startIndex;
  let depth = 1;
  while (cursor < source.length) {
    const char = source[cursor];
    const next = source[cursor + 1];

    if (char === '\'' || char === '"') {
      const parsed = parseStringLiteral(source, cursor);
      if (!parsed) {
        break;
      }
      cursor = parsed.end;
      continue;
    }

    if (char === '/' && next === '/') {
      cursor += 2;
      while (cursor < source.length && source[cursor] !== '\n') {
        cursor += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      cursor += 2;
      while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) {
        cursor += 1;
      }
      cursor += cursor < source.length ? 2 : 0;
      continue;
    }

    if (char === '{') {
      depth += 1;
      cursor += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return { expression: source.slice(startIndex, cursor), end: cursor + 1 };
      }
      cursor += 1;
      continue;
    }

    if (char === '\\') {
      cursor += 2;
      continue;
    }

    cursor += 1;
  }

  return null;
}

function skipTemplateLiteral(source, index, specifiers) {
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    const next = source[cursor + 1];

    if (char === '\\') {
      cursor += 2;
      continue;
    }

    if (char === '`') {
      return cursor + 1;
    }

    if (char === '$' && next === '{') {
      const expression = collectTemplateExpression(source, cursor + 2);
      if (!expression) {
        return source.length;
      }
      mergeSpecifiers(specifiers, extractRuntimeImportSpecifiers(expression.expression));
      cursor = expression.end;
      continue;
    }

    cursor += 1;
  }

  return source.length;
}

function collectFromClauseSpecifier(source, startIndex, specifiers) {
  let cursor = startIndex;
  while (cursor < source.length) {
    if (isKeywordAt(source, cursor, 'from')) {
      const fromTargetCursor = skipWhitespace(source, cursor + 4);
      const parsed = parseStringLiteral(source, fromTargetCursor);
      if (parsed) {
        specifiers.add(parsed.value);
        return parsed.end;
      }
      cursor += 4;
      continue;
    }
    if (source[cursor] === ';') {
      return cursor;
    }
    cursor += 1;
  }
  return cursor;
}

function collectImportSpecifier(source, index, specifiers) {
  let cursor = skipWhitespace(source, index + 6);
  if (source[cursor] === '(') {
    cursor = skipWhitespace(source, cursor + 1);
    const parsed = parseStringLiteral(source, cursor);
    if (parsed) {
      specifiers.add(parsed.value);
      cursor = parsed.end;
    }
  } else if (source[cursor] === '\'' || source[cursor] === '"') {
    const parsed = parseStringLiteral(source, cursor);
    if (parsed) {
      specifiers.add(parsed.value);
      cursor = parsed.end;
    }
  } else {
    cursor = collectFromClauseSpecifier(source, cursor, specifiers);
  }
  return Math.max(cursor, index + 6);
}

function collectExportSpecifier(source, index, specifiers) {
  const cursor = collectFromClauseSpecifier(source, index + 6, specifiers);
  return Math.max(cursor, index + 6);
}

function collectRequireSpecifier(source, index, specifiers) {
  let cursor = skipWhitespace(source, index + 7);
  if (source[cursor] === '(') {
    cursor = skipWhitespace(source, cursor + 1);
    const parsed = parseStringLiteral(source, cursor);
    if (parsed) {
      specifiers.add(parsed.value);
      cursor = parsed.end;
    }
  }
  return Math.max(cursor, index + 7);
}

function extractRuntimeImportSpecifiers(source) {
  const specifiers = new Set();
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      index = skipLineComment(source, index);
      continue;
    }

    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index);
      continue;
    }

    if (char === '`') {
      index = skipTemplateLiteral(source, index, specifiers);
      continue;
    }

    if (char === '\'' || char === '"') {
      const parsed = parseStringLiteral(source, index);
      index = parsed ? parsed.end : source.length;
      continue;
    }

    const importBoundary =
      source.startsWith('import', index) &&
      !isIdentifierChar(source[index - 1] ?? '') &&
      !isIdentifierChar(source[index + 6] ?? '');
    if (importBoundary) {
      index = collectImportSpecifier(source, index, specifiers);
      continue;
    }

    const exportBoundary =
      source.startsWith('export', index) &&
      !isIdentifierChar(source[index - 1] ?? '') &&
      !isIdentifierChar(source[index + 6] ?? '');
    if (exportBoundary) {
      index = collectExportSpecifier(source, index, specifiers);
      continue;
    }

    const requireBoundary =
      source.startsWith('require', index) &&
      !isIdentifierChar(source[index - 1] ?? '') &&
      !isIdentifierChar(source[index + 7] ?? '');
    if (requireBoundary) {
      index = collectRequireSpecifier(source, index, specifiers);
      continue;
    }

    index += 1;
  }

  return specifiers;
}

export function validateUndeclaredRuntimeImports({ packageName, packedManifest, jsFiles }) {
  const declaredDependencies = new Set([
    ...Object.keys(packedManifest.dependencies ?? {}),
    ...Object.keys(packedManifest.optionalDependencies ?? {}),
    ...Object.keys(packedManifest.peerDependencies ?? {}),
  ]);

  const builtins = new Set(
    builtinModules.flatMap((moduleName) =>
      moduleName.startsWith('node:') ? [moduleName, moduleName.slice(5)] : [moduleName, `node:${moduleName}`],
    ),
  );

  const unresolved = new Set();

  for (const source of Object.values(jsFiles)) {
    const specifiers = extractRuntimeImportSpecifiers(source);
    for (const specifier of specifiers) {
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
        continue;
      }

      if (builtins.has(specifier)) {
        continue;
      }

      const packageSpecifier = extractPackageName(specifier);
      if (!declaredDependencies.has(packageSpecifier)) {
        unresolved.add(packageSpecifier);
      }
    }
  }

  if (unresolved.size > 0) {
    throw new Error(
      `Packed artifact has undeclared runtime imports for ${packageName}: ${[...unresolved].sort().join(', ')}`,
    );
  }
}

export function validateBuildPreconditions(packageDir, packagePath, sourceManifest) {
  const requiredTargets = [];
  if (typeof sourceManifest.main === 'string') {
    requiredTargets.push(sourceManifest.main);
  }
  if (typeof sourceManifest.types === 'string') {
    requiredTargets.push(sourceManifest.types);
  }
  if (sourceManifest.bin && typeof sourceManifest.bin === 'object') {
    for (const binPath of Object.values(sourceManifest.bin)) {
      if (typeof binPath === 'string') {
        requiredTargets.push(binPath);
      }
    }
  }

  const missingTargets = [...new Set(requiredTargets)].filter(
    (target) => !existsSync(path.join(packagePath, target.replace(/^\.\//, ''))),
  );

  if (missingTargets.length > 0) {
    throw new Error(
      `Build precondition failed for ${packageDir}: missing built targets ${missingTargets.join(', ')}. Run pnpm install && pnpm build before pnpm verify:release-artifacts.`,
    );
  }
}

function getRequiredManifest(manifests, packageDir) {
  const manifest = manifests.get(packageDir);
  if (!manifest) {
    throw new Error(`Missing manifest for release package: ${packageDir}`);
  }
  return manifest;
}

function readPackedManifest(archivePath) {
  return JSON.parse(runCommand('tar', ['-xOf', archivePath, 'package/package.json']));
}

function readPackedFiles(archivePath) {
  return runCommand('tar', ['-tf', archivePath])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readPackedJsFiles(archivePath, packedFiles) {
  const jsFiles = {};
  for (const packedFile of packedFiles) {
    if (!packedFile.startsWith('package/') || !packedFile.endsWith('.js')) {
      continue;
    }
    jsFiles[packedFile] = runCommand('tar', ['-xOf', archivePath, packedFile]);
  }
  return jsFiles;
}

async function verifyReleaseArtifacts(rootDir) {
  const workspaceYaml = await readFile(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf8');
  const workspaceGlobs = parseWorkspaceGlobs(workspaceYaml);
  validateReleasePackageLayout({ releasePackages: RELEASE_PACKAGES, workspaceGlobs });
  validatePublishSet({
    publishPackages: PUBLISH_PACKAGES,
    releasePackages: RELEASE_PACKAGES,
    nonReleasePackages: NON_RELEASE_PACKAGES,
  });

  const manifests = await loadReleaseManifests(rootDir, RELEASE_PACKAGES);
  validateReleaseManifestNames(manifests);
  validatePublishManifests(manifests, PUBLISH_PACKAGES);

  const tempPackDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-release-pack-'));
  try {
    for (const packageDir of RELEASE_PACKAGES) {
      const packagePath = getReleasePackagePath(rootDir, packageDir);
      const sourceManifest = getRequiredManifest(manifests, packageDir);
      validateBuildPreconditions(packageDir, packagePath, sourceManifest);
      const output = runCommand(
        'pnpm',
        ['--dir', packagePath, 'pack', '--pack-destination', tempPackDir],
        { cwd: rootDir },
      );
      const archivePath = output.split(/\r?\n/).filter(Boolean).at(-1);
      if (!archivePath) {
        throw new Error(`pnpm pack did not return an archive path for ${packageDir}`);
      }

      const packedManifest = readPackedManifest(archivePath);
      const packedFiles = readPackedFiles(archivePath);
      validateWorkspaceDependencyLeakage(packedManifest);
      validatePackedContract({ packageDir, sourceManifest, packedManifest, packedFiles });
      validateUndeclaredRuntimeImports({
        packageName: packedManifest.name,
        packedManifest,
        jsFiles: readPackedJsFiles(archivePath, packedFiles),
      });
    }
  } finally {
    await rm(tempPackDir, { recursive: true, force: true });
  }
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    await verifyReleaseArtifacts(process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export { verifyReleaseArtifacts };
