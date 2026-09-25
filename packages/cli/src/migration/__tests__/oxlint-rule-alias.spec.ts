import { type OxlintConfig } from 'oxlint';
import { describe, expect, it } from 'vitest';

import { sanitizeMigratedOxlintConfig } from '../migrator/eslint.ts';

describe('Oxlint rule aliases during migration', () => {
  it('preserves supported TypeScript aliases in base rules and overrides', () => {
    const config = {
      plugins: ['typescript'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@unknown/not-a-real-rule': 'warn',
      },
      overrides: [
        {
          files: ['src/**/*.ts'],
          rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
          },
        },
      ],
    } as OxlintConfig;

    sanitizeMigratedOxlintConfig(config, new Set());

    expect(config.rules).toEqual({
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    });
    expect(config.overrides?.[0].rules).toEqual({
      '@typescript-eslint/consistent-type-imports': 'error',
    });
  });
});
