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
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
];