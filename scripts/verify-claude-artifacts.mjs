import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_ARTIFACTS = [
  '.claude/settings.json',
  '.claude/hooks',
  '.claude/skills/wiki/SKILL.md',
];

const FORBIDDEN_ARTIFACT_PREFIXES = ['.claude/hooks/'];
const SKILL_PACKAGE_PATH = path.join('packages', 'skill', 'llm-memory', 'package.json');
const RELEASE_WORKFLOW_PATH = path.join('.github', 'workflows', 'release.yml');

function parsePackLoopPackages(workflowContent) {
  const match = workflowContent.match(/for\s+pkg\s+in\s+([^;]+);/);
  if (!match) {
    return [];
  }

  return match[1].trim().split(/\s+/).filter(Boolean);
}

function normalizeWorkflowPackagePath(value) {
  const trimmedValue = value.trim().replace(/^['"]|['"]$/g, '').replace(/^\.?\//, '');
  if (!trimmedValue) {
    return '';
  }
  if (trimmedValue === 'skill' || trimmedValue === 'llm-memory' || trimmedValue === 'skill/llm-memory') {
    return 'packages/skill/llm-memory';
  }
  if (trimmedValue.startsWith('packages/')) {
    return trimmedValue;
  }
  return `packages/${trimmedValue}`;
}

function releaseWorkflowIncludesSkill(workflowContent) {
  const packPackages = parsePackLoopPackages(workflowContent);
  for (const packPackage of packPackages) {
    if (normalizeWorkflowPackagePath(packPackage) === 'packages/skill/llm-memory') {
      return true;
    }
  }

  const publishPackageMatches = workflowContent.matchAll(/publish_package\s+([^\s]+)/g);
  for (const publishPackageMatch of publishPackageMatches) {
    if (normalizeWorkflowPackagePath(publishPackageMatch[1] ?? '') === 'packages/skill/llm-memory') {
      return true;
    }
  }

  return false;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadSkillPackage(rootDir) {
  const packageJsonPath = path.join(rootDir, SKILL_PACKAGE_PATH);
  return JSON.parse(await readFile(packageJsonPath, 'utf8'));
}

async function loadReleaseWorkflow(rootDir) {
  const workflowPath = path.join(rootDir, RELEASE_WORKFLOW_PATH);
  return readFile(workflowPath, 'utf8');
}

export async function verifyClaudeArtifacts(rootDir, options = {}) {
  const trackedFiles = options.trackedFiles ?? [];

  for (const artifactPath of FORBIDDEN_ARTIFACTS) {
    if (await pathExists(path.join(rootDir, artifactPath))) {
      throw new Error(`Claude artifact must remain absent: ${artifactPath}`);
    }
  }

  for (const trackedPath of trackedFiles) {
    for (const prefix of FORBIDDEN_ARTIFACT_PREFIXES) {
      if (trackedPath.startsWith(prefix)) {
        throw new Error(`Claude hook artifact must remain absent: ${trackedPath}`);
      }
    }
  }

  const skillPackage = await loadSkillPackage(rootDir);
  if (skillPackage.private !== true) {
    throw new Error(`${SKILL_PACKAGE_PATH} must remain private: true`);
  }

  const releaseWorkflow = await loadReleaseWorkflow(rootDir);
  if (releaseWorkflowIncludesSkill(releaseWorkflow)) {
    throw new Error(
      `${RELEASE_WORKFLOW_PATH} must not include packages/skill/llm-memory in release pack/publish targets`,
    );
  }
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    await verifyClaudeArtifacts(process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
