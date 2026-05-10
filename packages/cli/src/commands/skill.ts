import { Command } from 'commander';
import path from 'node:path';
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type SkillRecord = {
  name: string;
  path: string;
  installedAt: string;
};

type SkillsManifest = {
  skills: SkillRecord[];
  [key: string]: unknown;
};

const AGENT_CONTEXT_DIR = '.agent_context';
const SKILLS_DIR = 'skills';
const MANIFEST_FILE = 'skills.json';

function getContextRoot(): string {
  return path.join(process.cwd(), AGENT_CONTEXT_DIR);
}

function getSkillsRoot(): string {
  return path.join(getContextRoot(), SKILLS_DIR);
}

function getManifestPath(): string {
  return path.join(getContextRoot(), MANIFEST_FILE);
}

function validateSkillName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Skill name is required.');
  }

  if (
    trimmed !== name ||
    name === '.' ||
    name === '..' ||
    path.isAbsolute(name) ||
    path.win32.isAbsolute(name) ||
    path.basename(name) !== name ||
    path.win32.basename(name) !== name ||
    name.includes('\\')
  ) {
    throw new Error('Invalid skill name. Use a single directory name without path separators.');
  }
}

function getDefaultSkillSourceRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../skill');
}

function getSkillSourceRoot(): string {
  return process.env.LLM_WIKI_SKILL_SOURCE_ROOT?.trim() || getDefaultSkillSourceRoot();
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(): Promise<SkillsManifest> {
  const manifestPath = getManifestPath();
  if (!(await pathExists(manifestPath))) {
    return { skills: [] };
  }

  const raw = await readFile(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<SkillsManifest>;
  const existingSkills = Array.isArray(parsed.skills) ? parsed.skills : [];
  return {
    ...parsed,
    skills: existingSkills.filter((entry): entry is SkillRecord => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as SkillRecord).name === 'string' &&
        typeof (entry as SkillRecord).path === 'string' &&
        typeof (entry as SkillRecord).installedAt === 'string'
      );
    }),
  };
}

async function writeManifest(manifest: SkillsManifest): Promise<void> {
  const contextRoot = getContextRoot();
  await mkdir(contextRoot, { recursive: true });
  await writeFile(getManifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

async function installSkill(name: string): Promise<void> {
  validateSkillName(name);

  const sourceRoot = getSkillSourceRoot();
  const sourcePath = path.join(sourceRoot, name);
  const targetPath = path.join(getSkillsRoot(), name);

  if (!(await pathExists(sourcePath))) {
    throw new Error(`Skill '${name}' not found in ${sourceRoot}.`);
  }

  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Skill '${name}' source is not a directory.`);
  }

  const manifest = await readManifest();
  const hasManifestEntry = manifest.skills.some((entry) => entry.name === name);
  const hasTargetDir = await pathExists(targetPath);

  if (hasManifestEntry && hasTargetDir) {
    console.log(`Skill '${name}' is already installed.`);
    return;
  }

  await mkdir(getSkillsRoot(), { recursive: true });
  await rm(targetPath, { recursive: true, force: true });
  await cp(sourcePath, targetPath, { recursive: true });

  const updatedSkills = manifest.skills.filter((entry) => entry.name !== name);
  updatedSkills.push({
    name,
    path: `${SKILLS_DIR}/${name}`,
    installedAt: new Date().toISOString(),
  });

  updatedSkills.sort((a, b) => a.name.localeCompare(b.name));
  await writeManifest({ ...manifest, skills: updatedSkills });

  console.log(`Installed skill '${name}' to ${targetPath}.`);
}

async function listSkills(): Promise<void> {
  const manifest = await readManifest();
  if (manifest.skills.length === 0) {
    console.log('No skills installed.');
    return;
  }

  const sorted = [...manifest.skills].sort((a, b) => a.name.localeCompare(b.name));
  console.log('Installed skills:');
  for (const skill of sorted) {
    console.log(`- ${skill.name}`);
  }
}

async function uninstallSkill(name: string): Promise<void> {
  validateSkillName(name);

  const manifest = await readManifest();
  const beforeCount = manifest.skills.length;
  const updatedSkills = manifest.skills.filter((entry) => entry.name !== name);

  const targetPath = path.join(getSkillsRoot(), name);
  const hasDir = await pathExists(targetPath);

  if (beforeCount === updatedSkills.length && !hasDir) {
    throw new Error(`Skill '${name}' is not installed.`);
  }

  await rm(targetPath, { recursive: true, force: true });

  if (updatedSkills.length === 0) {
    await rm(getManifestPath(), { force: true });
    if (await pathExists(getSkillsRoot())) {
      const remaining = await readdir(getSkillsRoot());
      if (remaining.length === 0) {
        await rm(getSkillsRoot(), { recursive: true, force: true });
      }
    }
  } else {
    await writeManifest({ ...manifest, skills: updatedSkills });
  }

  console.log(`Uninstalled skill '${name}'.`);
}

export const skillCommand = new Command()
  .name('skill')
  .description('Manage agent skills in .agent_context/skills')
  .addCommand(
    new Command('install')
      .description('Install a skill into .agent_context/skills')
      .argument('<name>', 'Skill name to install')
      .action(async (name: string) => {
        try {
          await installSkill(name);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to install skill: ${message}`);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('list').description('List installed skills').action(async () => {
      try {
        await listSkills();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to list skills: ${message}`);
        process.exit(1);
      }
    }),
  )
  .addCommand(
    new Command('uninstall')
      .description('Uninstall a skill from .agent_context/skills')
      .argument('<name>', 'Skill name to uninstall')
      .action(async (name: string) => {
        try {
          await uninstallSkill(name);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to uninstall skill: ${message}`);
          process.exit(1);
        }
      }),
  );
