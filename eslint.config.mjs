import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.mjs'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Next.js rules (basic)
      'react/react-in-jsx-scope': 'off', // Next.js auto-imports React
      'react/prop-types': 'off', // TypeScript handles prop validation

      // General best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Deno-specific globals for Edge Functions
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      globals: {
        Deno: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        structuredClone: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        queueMicrotask: 'readonly',
        addEventListener: 'readonly',
      },
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'out/**',
      '.planning/**',
      'supabase/functions/**/*.js', // Edge Functions use Deno, not Node
    ],
  }
);
