import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  {
    ignores: ['src/docs/**', 'node_modules/**', 'main.js', 'styles.css', '.vscode/**'],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    files: ['src/components/Editor/flatpickr/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['buffer-es6.mjs', 'esbuild.config.mjs', 'version-bump.mjs'],
    rules: {
      'eslint-comments/require-description': 'off',
      'obsidianmd/rule-custom-message': 'off',
      'no-undef': 'off',
      'obsidianmd/no-nodejs-modules': 'off',
    },
  },
  {
    files: ['buffer-es6.mjs'],
    rules: {
      'no-empty': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['version-bump.mjs'],
    rules: {
      'obsidianmd/no-nodejs-modules': 'off',
      'no-undef': 'off',
    },
  },
];