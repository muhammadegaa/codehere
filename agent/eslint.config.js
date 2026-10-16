import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': { typescript: true, node: true },
    },
    rules: {
      // R0 anti-graveyard gate: the dependency graph stays acyclic. A clean
      // architecture is a DAG; a new import cycle is how layering rots silently.
      // maxDepth unset = unbounded — a deep (7+ hop) cycle must not pass. Safe at
      // this repo's size (117 src files); 0 cycles today.
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',

      // Catch real bugs
      'no-console': 'off', // CLI tool, console is fine
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unreachable': 'error',
      'prefer-const': 'error',

      // Relaxed for existing codebase (tighten later)
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // codehere is a terminal tool — stripping/handling ANSI escape codes
      // (\x1b) in regexes is intentional throughout (progress-aggregator,
      // input-validator, cassette, ui). The rule flags those control chars as
      // potential typos, which they are not here.
      'no-control-regex': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'test/', '*.js', '*.mjs'],
  },
);
