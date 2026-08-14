module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
    jest: true,
  },
  ignorePatterns: ['./src/docs'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    project: './tsconfig.json',
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/member-delimiter-style': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    'linebreak-style': ['error', 'unix'],
    indent: 'off',
    quotes: 'off',
  },
  overrides: [
    {
      files: ['src/components/Editor/flatpickr/**/*.{ts,tsx}'],
      rules: {
        // Vendored flatpickr sources rely heavily on dynamic internals and are not worth
        // refactoring just to satisfy this rule.
        '@typescript-eslint/no-unsafe-return': 'off',
      },
    },
    {
      files: [
        'src/Settings.ts',
        'src/main.ts',
        'src/components/Editor/MarkdownEditor.tsx',
        'src/components/Item/MetadataTable.tsx',
        'src/components/Item/helpers.ts',
        'src/components/Kanban.tsx',
        'src/components/Lane/Lane.tsx',
        'src/components/helpers.ts',
        'src/dnd/util/createHTMLDndEntity.ts',
        'src/helpers/boardModifiers.ts',
        'src/parsers/List.ts',
        'src/parsers/common.ts',
        'src/parsers/formats/list.ts',
        'src/parsers/helpers/inlineMetadata.ts',
        'src/parsers/parseMarkdown.ts',
      ],
      rules: {
        // These files sit on dynamic Obsidian/CodeMirror/Dataview/Tasks boundaries where
        // precise static return typing would require risky refactors with little runtime value.
        '@typescript-eslint/no-unsafe-return': 'off',
      },
    },
  ],
};
