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
    files: [
      'src/Settings.ts',
      'src/main.ts',
      'src/components/Editor/MarkdownEditor.tsx',
      'src/components/MarkdownRenderer/MarkdownRenderer.tsx',
      'src/components/Item/MetadataTable.tsx',
      'src/components/Item/helpers.ts',
      'src/components/Item/ItemMenu.ts',
      'src/components/Item/ItemContent.tsx',
      'src/components/Item/InlineMetadata.tsx',
      'src/components/Kanban.tsx',
      'src/components/Lane/Lane.tsx',
      'src/components/Lane/LaneMenu.tsx',
      'src/components/Table/helpers.tsx',
      'src/components/helpers.ts',
      'src/dnd/managers/DragManager.ts',
      'src/dnd/managers/EntityManager.ts',
      'src/dnd/managers/ScrollManager.ts',
      'src/dnd/util/createHTMLDndEntity.ts',
      'src/helpers/patch.ts',
      'src/helpers/boardModifiers.ts',
      'src/helpers/renderMarkdown.ts',
      'src/helpers/util.ts',
      'src/helpers.ts',
      'src/parsers/List.ts',
      'src/parsers/common.ts',
      'src/parsers/formats/list.ts',
      'src/parsers/extensions/blockid.ts',
      'src/parsers/extensions/genericWrapped.ts',
      'src/parsers/extensions/internalMarkdownLink.ts',
      'src/parsers/extensions/tag.ts',
      'src/parsers/extensions/taskList.ts',
      'src/parsers/helpers/inlineMetadata.ts',
      'src/parsers/helpers/parser.ts',
      'src/parsers/helpers/hydrateBoard.ts',
      'src/parsers/helpers/ast.ts',
      'src/parsers/parseMarkdown.ts',
      'src/settingHelpers.ts',
      'src/settings/DateColorSettings.tsx',
      'src/StateManager.ts',
      'src/KanbanView.tsx',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    files: ['src/settings/MetadataSettings.tsx', 'src/settings/TagSortSettings.tsx'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
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
    files: ['src/components/Table/Table.tsx'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['src/components/Editor/helpers.ts', 'src/components/Editor/suggest.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['src/dnd/components/DndContext.tsx', 'src/dnd/components/DragOverlay.tsx'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['src/main.ts'],
    rules: {
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    files: ['src/dnd/util/data.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['src/helpers/renderMarkdown.ts', 'src/components/Kanban.tsx', 'src/components/Lane/Lane.tsx'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['src/components/Item/helpers.ts'],
    rules: {
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-for-in-array': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
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