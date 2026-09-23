import fs from 'node:fs';

import { type OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { createMigrationReport } from '../report.ts';

vi.mock('../../../binding/index.js', () => ({ rewriteEslint: vi.fn() }));

const { sanitizeMigratedOxlintConfig } = await import('../migrator/eslint.ts');

const REACT_COMPILER_REPLACEMENTS = [
  'react/capitalized-calls',
  'react/error-boundaries',
  'react/exhaustive-effect-dependencies',
  'react/globals',
  'react/hooks',
  'react/immutability',
  'react/incompatible-library',
  'react/invariant',
  'react/memo-dependencies',
  'react/no-deriving-state-in-effects',
  'react/preserve-manual-memoization',
  'react/purity',
  'react/refs',
  'react/rule-suppression',
  'react/set-state-in-effect',
  'react/set-state-in-render',
  'react/static-components',
  'react/syntax',
  'react/todo',
  'react/unsupported-syntax',
  'react/use-memo',
  'react/void-use-memo',
] as const;

function bundledRuleNames(): Set<string> {
  const schema = JSON.parse(
    fs.readFileSync(
      new URL('configuration_schema.json', import.meta.resolve('oxlint/package.json')),
      'utf8',
    ),
  ) as { definitions: { DummyRuleMap: { properties: Record<string, unknown> } } };
  return new Set(Object.keys(schema.definitions.DummyRuleMap.properties));
}

describe('Oxlint rule compatibility migration', () => {
  it('keeps the React Compiler compatibility map aligned with bundled Oxlint', () => {
    const nativeRules = bundledRuleNames();

    expect(nativeRules.has('react/react-compiler')).toBe(false);
    expect(REACT_COMPILER_REPLACEMENTS).toHaveLength(22);
    for (const ruleName of REACT_COMPILER_REPLACEMENTS) {
      expect(nativeRules.has(ruleName), ruleName).toBe(true);
    }
  });

  it('expands react/react-compiler while preserving severity and explicit category settings', () => {
    const config = {
      rules: {
        'react/react-compiler': 'error',
        'react/refs': 'off',
      },
      overrides: [
        {
          files: ['legacy.tsx'],
          rules: { 'react/react-compiler': ['warn', { reportAllBailouts: true }] },
        },
      ],
    } as unknown as OxlintConfig;
    const report = createMigrationReport();

    sanitizeMigratedOxlintConfig(config, new Set(), report);

    expect(config.rules).not.toHaveProperty('react/react-compiler');
    expect(config.rules?.['react/refs']).toBe('off');
    for (const ruleName of REACT_COMPILER_REPLACEMENTS) {
      if (ruleName !== 'react/refs') {
        expect(config.rules?.[ruleName]).toBe('error');
      }
      expect(config.overrides?.[0].rules?.[ruleName]).toBe('warn');
    }
    expect(config.overrides?.[0].rules).not.toHaveProperty('react/react-compiler');
    expect(report.warnings).toEqual([
      'Oxlint replaced react/react-compiler with category-specific rules. ' +
        'Enabled its 22 supported replacements in the migrated config.',
      'The category-specific React Compiler rules do not support the options from react/react-compiler. ' +
        'Preserved its severity but removed those options; review the migrated React Compiler rules.',
    ]);
  });

  it('strips unknown native rules but preserves rules from surviving JS plugins', () => {
    const config = {
      rules: {
        'react/not-a-real-rule': 'error',
        'not-a-real-core-rule': 'warn',
        'local/custom-rule': 'error',
        'react/display-name': 'error',
      },
      jsPlugins: [{ name: 'local', specifier: './lint/plugin.js' }],
    } as OxlintConfig;
    const report = createMigrationReport();

    sanitizeMigratedOxlintConfig(config, new Set(), report);

    expect(config.rules).toEqual({
      'local/custom-rule': 'error',
      'react/display-name': 'error',
    });
    expect(report.warnings).toContain(
      'Stripped rule reference(s) unsupported by the bundled Oxlint: react/not-a-real-rule, not-a-real-core-rule. ' +
        'Review the Oxlint release notes and replace them with supported rules in `lint.rules`.',
    );
  });
});
