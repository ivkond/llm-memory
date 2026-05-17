import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_PACKAGES } from './release-metadata.mjs';

export { RELEASE_PACKAGES };

const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export async function setReleaseVersion(rootDir, version, packageNames = RELEASE_PACKAGES) {
  if (!RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error(`Release version must match X.Y.Z, got: ${version}`);
  }

  for (const packageName of packageNames) {
    const packageJsonPath = path.join(rootDir, 'packages', packageName, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    packageJson.version = version;
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node scripts/set-release-version.mjs <version>');
    process.exit(1);
  }

  try {
    await setReleaseVersion(process.cwd(), version);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
