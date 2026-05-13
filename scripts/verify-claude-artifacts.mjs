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
