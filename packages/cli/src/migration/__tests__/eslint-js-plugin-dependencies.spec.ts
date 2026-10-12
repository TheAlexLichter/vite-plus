import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type OxlintConfig } from 'oxlint';
import { expect, it } from 'vitest';

import {
  collectJsPluginPackageNames,
  rewriteEslintPackageJson,
  sanitizeMigratedOxlintConfig,
} from '../migrator/eslint.ts';
import { createMigrationReport } from '../report.ts';

it('preserves packages referenced by aliased JS plugins in base config and overrides', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-js-plugin-deps-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, '.oxlintrc.json'),
      JSON.stringify({
        jsPlugins: [
          { name: 'nextjs-js', specifier: '@next/eslint-plugin-next' },
          { name: 'local', specifier: './plugin.js' },
          { name: 'own', specifier: 'vite-plus/oxlint-plugin' },
        ],
        overrides: [
          {
            files: ['**/*.tsx'],
            jsPlugins: [{ name: 'react-js', specifier: 'eslint-plugin-react' }],
          },
        ],
      }),
    );
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({
        devDependencies: {
          eslint: '^9.0.0',
          '@next/eslint-plugin-next': '^16.0.0',
          'eslint-plugin-react': '^7.0.0',
          'eslint-plugin-unused': '^1.0.0',
          'vite-plus': '^1.0.0',
        },
      }),
    );

    const preserved = collectJsPluginPackageNames(tmpDir);
    expect(preserved).toEqual(
      new Set(['@next/eslint-plugin-next', 'vite-plus', 'eslint-plugin-react']),
    );
    rewriteEslintPackageJson(pkgPath, preserved);

    expect(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).devDependencies).toEqual({
      '@next/eslint-plugin-next': '^16.0.0',
      'eslint-plugin-react': '^7.0.0',
      'vite-plus': '^1.0.0',
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

it('keeps installed aliased plugins and removes missing ones from base config and overrides', () => {
  const next = { name: 'nextjs-js', specifier: '@next/eslint-plugin-next' };
  const react = { name: 'react-js', specifier: 'eslint-plugin-react' };
  const local = { name: 'local', specifier: './plugin.js' };
  const own = { name: 'own', specifier: 'vite-plus/oxlint-plugin' };
  const config: OxlintConfig = {
    jsPlugins: [next, local, own, { name: 'missing', specifier: 'eslint-plugin-missing' }],
    rules: { 'nextjs-js/rule': 'error', 'local/rule': 'warn', 'missing/rule': 'error' },
    overrides: [
      {
        files: ['**/*.tsx'],
        jsPlugins: [react, { name: 'missing-override', specifier: 'eslint-plugin-absent' }],
        rules: { 'react-js/rule': 'warn', 'missing-override/rule': 'error' },
      },
    ],
  };
  const report = createMigrationReport();

  sanitizeMigratedOxlintConfig(
    config,
    new Set(['@next/eslint-plugin-next', 'eslint-plugin-react', 'vite-plus']),
    report,
  );

  expect(config.jsPlugins).toEqual([next, local, own]);
  expect(config.rules).toEqual({ 'nextjs-js/rule': 'error', 'local/rule': 'warn' });
  expect(config.overrides?.[0].jsPlugins).toEqual([react]);
  expect(config.overrides?.[0].rules).toEqual({ 'react-js/rule': 'warn' });
  expect(report.warnings[0]).toContain('eslint-plugin-missing, eslint-plugin-absent');
});
