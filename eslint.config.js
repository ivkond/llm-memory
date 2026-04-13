import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettierConfig from 'eslint-config-prettier';

// Rule philosophy for this brownfield codebase:
//   error  → catches real bugs or enforces architectural contracts (commit-blocking)
//   warn   → nags without blocking; signal for future cleanup
//   off    → stylistic-only or already covered by tsc; keeps signal-to-noise high
//
// As the code evolves, warn-level rules can be promoted to error in focused
// follow-up PRs rather than in one big "lint everything" explosion.

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-tests/**',
      '**/node_modules/**',
      '.worktrees/**',
      '.planning/**',
      '**/*.tsbuildinfo',
      '**/coverage/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'vitest.workspace.ts',
            'packages/*/vitest.config.ts',
            'packages/cli/tsconfig.json',
            'packages/cli/tests/tsconfig.json',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: [
            './packages/core/tsconfig.json',
            './packages/core/tests/tsconfig.json',
            './packages/infra/tsconfig.json',
            './packages/infra/tests/tsconfig.json',
            './packages/common/tsconfig.json',
            './packages/common/tests/tsconfig.json',
            './packages/mcp-server/tsconfig.json',
            './packages/mcp-server/tests/tsconfig.json',
            './packages/cli/tsconfig.json',
            './packages/cli/tests/tsconfig.json',
          ],
        },
        node: true,
      },
    },
    rules: {
      // ── Catch real bugs (error) ────────────────────────────────────────────
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      // Stringifying unknown-typed values from MCP params is common and intentional
      '@typescript-eslint/no-base-to-string': 'warn',

      // ── Nag without blocking (warn) ────────────────────────────────────────
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/return-await': ['warn', 'in-try-catch'],
      // Fires on error-typed constituents (from unresolved external types like re2,
      // MiniSearch, ruvector). The underlying issue is type resolution, not redundancy
      // — demote so it surfaces the real cases once resolution is clean.
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      // Template-expression restriction fires on `never` inferred in error-propagation
      // paths. Keep as warn until the type flow is tightened.
      '@typescript-eslint/restrict-template-expressions': 'warn',

      // ── Redundant with tsc or pure style (off) ─────────────────────────────
      'import-x/no-unresolved': 'off', // TypeScript projectService already checks this
      'import-x/order': 'off', // stylistic only, re-enable in a focused sort-imports PR
      'import-x/named': 'off', // TypeScript already checks named exports
      'import-x/namespace': 'off', // TypeScript already checks
      'import-x/default': 'off', // TypeScript already checks

      // ── Architectural contracts (error) — core of why we have this linter ──
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './packages/core/src/domain',
              from: './packages/core/src/services',
              message: 'Domain layer has zero deps: it must not import from services.',
            },
            {
              target: './packages/core/src/domain',
              from: './packages/infra',
              message: 'Domain layer has zero deps: it must not import from infra.',
            },
            {
              target: './packages/core/src',
              from: './packages/infra',
              message:
                'Core must not import from infra (Clean Architecture: Infrastructure → Application → Domain, never the reverse).',
            },
          ],
        },
      ],
    },
  },
  {
    // Test files get the same boundary rules but with relaxations for fakes and
    // dynamic test data. Fake classes must match async interfaces without
    // always using await; test data often crosses `unknown`/`any` boundaries.
    files: ['**/tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'import-x/no-restricted-paths': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Vitest's `expect(fake.method)` pattern is standard for assertion on mocks
      // and does not actually cause `this` rebinding issues — rule is too noisy
      // for mock-heavy tests.
      '@typescript-eslint/unbound-method': 'off',
      // Test fixtures frequently construct intersection types with mocked ports;
      // the constituents are resolved at runtime by the test, not statically.
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    files: ['**/*.config.js', '**/*.config.ts', '**/*.config.mjs', 'vitest.workspace.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettierConfig,
);
