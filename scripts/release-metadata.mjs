import path from 'node:path';

export const PACKAGE_SCOPE = '@ivkond-llm-wiki';
export const RELEASE_PACKAGES = ['core', 'infra', 'common', 'cli', 'mcp-server'];
export const PUBLISH_PACKAGES = ['cli', 'mcp-server'];
export const NON_RELEASE_PACKAGES = ['packages/skill/llm-memory'];
export const PACKAGE_NAME_MAP = {
  'mcp-server': 'mcp-server',
};

export function getReleasePackagePath(rootDir, packageDir) {
  return path.join(rootDir, 'packages', packageDir);
}

export function getExpectedPackageName(packageDir) {
  const mappedName = PACKAGE_NAME_MAP[packageDir] ?? packageDir;
  return `${PACKAGE_SCOPE}/${mappedName}`;
}
