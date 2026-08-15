 

import { TFile } from 'obsidian';
import { getAPI } from 'obsidian-dataview';
import { StateManager } from 'src/StateManager';
import { Board, Item } from 'src/components/types';
import { isPlainObject } from 'src/helpers/isPlainObject';

import { diff, diffApply } from '../helpers/patch';
import { BaseFormat } from './common';
import {
  astToUnhydratedBoard,
  boardToMd,
  newItem,
  reparseBoard,
  updateItemContent,
} from './formats/list';
import { hydrateBoard, hydratePostOp } from './helpers/hydrateBoard';
import { parseMarkdown } from './parseMarkdown';

const generatedKeys: Array<string | number> = [
  'id',
  'date',
  'time',
  'titleSearch',
  'titleSearchRaw',
  'file',
];

interface DataviewValueApi {
  isObject: (value: unknown) => boolean;
  toString: (value: unknown) => string;
}

interface DataviewApiLike {
  value: DataviewValueApi;
}

function getDataviewApi(): DataviewApiLike | null {
  return getAPI() as DataviewApiLike | null;
}

function stringifyDiffValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }
  if (value instanceof TFile) return String(value.path);
  if (isPlainObject(value) || Array.isArray(value)) {
    const jsonValue = JSON.stringify(value);
    return typeof jsonValue === 'string' ? jsonValue : '';
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return '[object]';
  if (typeof value === 'symbol') return '[symbol]';
  if (typeof value === 'bigint') return value.toString(10);
  return '[function]';
}

export class ListFormat implements BaseFormat {
  stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  newItem(content: string, checkChar: string, forceEdit?: boolean) {
    return newItem(this.stateManager, content, checkChar, forceEdit);
  }

  updateItemContent(item: Item, content: string) {
    return updateItemContent(this.stateManager, item, content);
  }

  boardToMd(board: Board) {
    return boardToMd(this.stateManager, board);
  }

  mdToBoard(md: string) {
    const { ast, settings, frontmatter } = parseMarkdown(this.stateManager, md);
    const newBoard = astToUnhydratedBoard(this.stateManager, settings, frontmatter, ast, md);
    const { state } = this.stateManager;
    const dv = getDataviewApi();

    if (!this.stateManager.hasError() && state) {
      const ops = diff(
        state,
        newBoard,
        (path) => {
          return generatedKeys.includes(path.last());
        },
        (val: unknown) => {
          if (!val || val instanceof TFile || isPlainObject(val) || Array.isArray(val)) {
            return stringifyDiffValue(val);
          }

          if (dv && !dv.value.isObject(val)) return dv.value.toString(val);

          return stringifyDiffValue(val);
        }
      );

      const patchedBoard = diffApply(state, ops) as Board;

      return hydratePostOp(this.stateManager, patchedBoard, ops);
    }

    return hydrateBoard(this.stateManager, newBoard);
  }

  reparseBoard() {
    return reparseBoard(this.stateManager, this.stateManager.state);
  }
}
