import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Scripts and the structured logger are the only places allowed to write to stdout.
    files: ['scripts/**', 'src/server/logging/**'],
    rules: { 'no-console': 'off' },
  },
  // services/ holds other runtimes (redsky-ocr is Python, with its own checks); a local virtualenv there ships
  // third-party JavaScript that is not ours to lint.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'dist/**', 'next-env.d.ts', 'prototype/**', 'playwright-report/**', 'test-results/**', 'services/**']),
]);
