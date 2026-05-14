import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_CLAUDE_ARTIFACTS = [
  '.claude/settings.json',
  '.claude/hooks/pre-commit.sh',
  '.claude/skills/wiki/SKILL.md',
];

const SKILL_PACKAGE_PATH = 'packages/skill/llm-memory/package.json';
const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';
const SKILL_PACKAGE_NAME = '@ivkond-llm-wiki/skill-llm-memory';

export async function verifyClaudeArtifacts(rootDir) {
  const failures = [];

  for (const relativePath of FORBIDDEN_CLAUDE_ARTIFACTS) {
    const absolutePath = path.join(rootDir, relativePath);
    try {
      await access(absolutePath);
      failures.push(`Unexpected Claude artifact present: ${relativePath}`);
    } catch {
      // Expected: artifact intentionally absent.
    }
  }

  const skillPackage = JSON.parse(
    await readFile(path.join(rootDir, SKILL_PACKAGE_PATH), 'utf8'),
  );

  if (skillPackage.private !== true) {
    failures.push(`${SKILL_PACKAGE_PATH} must keep \"private\": true`);
  }

  const files = Array.isArray(skillPackage.files) ? skillPackage.files : [];
  const hasPublishListEntry = files.some((entry) => entry.includes('dist'));
  if (hasPublishListEntry) {
    failures.push(`${SKILL_PACKAGE_PATH} must not define publishable runtime artifacts`);
  }

  const releaseWorkflow = await readFile(path.join(rootDir, RELEASE_WORKFLOW_PATH), 'utf8');
  if (releaseWorkflow.includes('packages/skill/llm-memory')) {
    failures.push('Release workflow must not pack or publish packages/skill/llm-memory');
  }

  if (releaseWorkflow.includes(SKILL_PACKAGE_NAME)) {
    failures.push(`Release workflow must not publish ${SKILL_PACKAGE_NAME}`);
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
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
