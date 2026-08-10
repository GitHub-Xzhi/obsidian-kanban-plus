import update from 'immutability-helper';
import { App, TFile, moment } from 'obsidian';
import { useEffect, useState } from 'preact/compat';

import { KanbanView } from './KanbanView';
import { KanbanSettings, SettingRetrievers } from './Settings';
import {
  generateInstanceId,
  getDefaultDateFormat,
  getDefaultTimeFormat,
} from './components/helpers';
import { Board, BoardTemplate, Item, Lane } from './components/types';
import { Path } from './dnd/types';
import { insertEntity, moveEntity, removeEntity, updateEntity } from './dnd/util/data';
import { ListFormat } from './parsers/List';
import { BaseFormat, frontmatterKey, shouldRefreshBoard } from './parsers/common';
import { getTaskStatusDone } from './parsers/helpers/inlineMetadata';
import { defaultDateTrigger, defaultMetadataPosition, defaultTimeTrigger } from './settingHelpers';

export class StateManager {
  onEmpty: () => void;
  getGlobalSettings: () => KanbanSettings;

  stateReceivers: Array<(state: Board) => void> = [];
  settingsNotifiers: Map<keyof KanbanSettings, Array<() => void>> = new Map();

  viewSet: Set<KanbanView> = new Set();
  compiledSettings: KanbanSettings = {};

  app: App;
  state: Board;
  file: TFile;

  parser: BaseFormat;

  constructor(
    app: App,
    initialView: KanbanView,
    initialData: string,
    onEmpty: () => void,
    getGlobalSettings: () => KanbanSettings
  ) {
    this.app = app;
    this.file = initialView.file;
    this.onEmpty = onEmpty;
    this.getGlobalSettings = getGlobalSettings;
    this.parser = new ListFormat(this);

    this.registerView(initialView, initialData, true);
  }

  getAView(): KanbanView {
    return this.viewSet.values().next().value;
  }

  hasError(): boolean {
    return !!this.state?.data?.errors?.length;
  }

  async registerView(view: KanbanView, data: string, shouldParseData: boolean) {
    if (!this.viewSet.has(view)) {
      this.viewSet.add(view);
    }

    // This helps delay blocking the UI until the the loading indicator is displayed
    await new Promise((res) => activeWindow.setTimeout(res, 10));

    if (shouldParseData) {
      await this.newBoard(view, data);
    } else {
      await view.prerender(this.state);
    }

    view.populateViewState(this.state.data.settings);
  }

  unregisterView(view: KanbanView) {
    if (this.viewSet.has(view)) {
      this.viewSet.delete(view);

      if (this.viewSet.size === 0) {
        this.onEmpty();
      }
    }
  }

  buildSettingRetrievers(): SettingRetrievers {
    return {
      getGlobalSettings: this.getGlobalSettings,
      getGlobalSetting: this.getGlobalSetting,
      getSetting: this.getSetting,
    };
  }

  async newBoard(view: KanbanView, md: string) {
    try {
      const board = this.getParsedBoard(md);
      await view.prerender(board);
      this.setState(board, false);
    } catch (e) {
      this.setError(e);
    }
  }

  saveToDisk() {
    if (this.state.data.errors.length > 0) {
      return;
    }

    const view = this.getAView();

    if (view) {
      const fileStr = this.parser.boardToMd(this.state);
      view.requestSaveToDisk(fileStr);

      this.viewSet.forEach((view) => {
        view.data = fileStr;
      });
    }
  }

  softRefresh() {
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  forceRefresh() {
    if (this.state) {
      try {
        this.compileSettings();
        this.state = this.parser.reparseBoard();

        this.stateReceivers.forEach((receiver) => receiver(this.state));
        this.settingsNotifiers.forEach((notifiers) => {
          notifiers.forEach((fn) => fn());
        });
        this.viewSet.forEach((view) => view.initHeaderButtons());
      } catch (e) {
        console.error(e);
        this.setError(e);
      }
    }
  }

  setState(state: Board | ((board: Board) => Board), shouldSave: boolean = true) {
    try {
      const oldSettings = this.state?.data.settings;
      const newState = typeof state === 'function' ? state(this.state) : state;
      const newSettings = newState?.data.settings;

      if (oldSettings && newSettings && shouldRefreshBoard(oldSettings, newSettings)) {
        this.state = update(this.state, {
          data: {
            settings: {
              $set: newSettings,
            },
          },
        });
        this.compileSettings();
        this.state = this.parser.reparseBoard();
      } else {
        this.state = newState;
        this.compileSettings();
      }

      this.viewSet.forEach((view) => {
        view.initHeaderButtons();
        view.validatePreviewCache(newState);
      });

      if (shouldSave) {
        this.saveToDisk();
      }

      this.stateReceivers.forEach((receiver) => receiver(this.state));

      if (oldSettings !== newSettings && newSettings) {
        this.settingsNotifiers.forEach((notifiers, key) => {
          if ((!oldSettings && newSettings) || oldSettings[key] !== newSettings[key]) {
            notifiers.forEach((fn) => fn());
          }
        });
      }
    } catch (e) {
      console.error(e);
      this.setError(e);
    }
  }

  useState(): Board {
    const [state, setState] = useState(this.state);

    useEffect(() => {
      this.stateReceivers.push((state) => setState(state));
      setState(this.state);
      return () => {
        this.stateReceivers.remove(setState);
      };
    }, []);

    return state;
  }

  useSetting<K extends keyof KanbanSettings>(key: K): KanbanSettings[K] {
    const [state, setState] = useState<KanbanSettings[K]>(this.getSetting(key));

    useEffect(() => {
      const receiver = () => setState(this.getSetting(key));

      if (this.settingsNotifiers.has(key)) {
        this.settingsNotifiers.get(key).push(receiver);
      } else {
        this.settingsNotifiers.set(key, [receiver]);
      }

      return () => {
        this.settingsNotifiers.get(key).remove(receiver);
      };
    }, []);

    return state;
  }

  compileSettings(suppliedSettings?: KanbanSettings) {
    const globalKeys = this.getGlobalSetting('metadata-keys') || [];
    const localKeys = this.getSettingRaw('metadata-keys', suppliedSettings) || [];
    const metadataKeys = Array.from(new Set([...globalKeys, ...localKeys]));

    const dateFormat =
      this.getSettingRaw('date-format', suppliedSettings) || getDefaultDateFormat(this.app);
    const dateDisplayFormat =
      this.getSettingRaw('date-display-format', suppliedSettings) || dateFormat;

    const timeFormat =
      this.getSettingRaw('time-format', suppliedSettings) || getDefaultTimeFormat(this.app);

    const archiveDateFormat =
      this.getSettingRaw('archive-date-format', suppliedSettings) || `${dateFormat} ${timeFormat}`;
    const cardCreatedTimeFormat =
      this.getSettingRaw('card-created-time-format', suppliedSettings) || 'YYYY-MM-DD HH:mm';
    const cardCompletedTimeFormat =
      this.getSettingRaw('card-completed-time-format', suppliedSettings) || 'YYYY-MM-DD HH:mm';

    this.compiledSettings = {
      [frontmatterKey]: this.getSettingRaw(frontmatterKey, suppliedSettings) || 'board',
      'date-format': dateFormat,
      'date-display-format': dateDisplayFormat,
      'date-time-display-format': dateDisplayFormat + ' ' + timeFormat,
      'date-trigger': this.getSettingRaw('date-trigger', suppliedSettings) || defaultDateTrigger,
      'inline-metadata-position':
        this.getSettingRaw('inline-metadata-position', suppliedSettings) || defaultMetadataPosition,
      'time-format': timeFormat,
      'time-trigger': this.getSettingRaw('time-trigger', suppliedSettings) || defaultTimeTrigger,
      'link-date-to-daily-note': this.getSettingRaw('link-date-to-daily-note', suppliedSettings),
      'move-dates': this.getSettingRaw('move-dates', suppliedSettings),
      'move-tags': this.getSettingRaw('move-tags', suppliedSettings),
      'move-task-metadata': this.getSettingRaw('move-task-metadata', suppliedSettings),
      'metadata-keys': metadataKeys,
      'archive-date-separator': this.getSettingRaw('archive-date-separator') || '',
      'archive-date-format': archiveDateFormat,
      'completed-card-insertion-method':
        this.getSettingRaw('completed-card-insertion-method', suppliedSettings) ?? 'prepend',
      'show-add-list': this.getSettingRaw('show-add-list', suppliedSettings) ?? true,
      'show-archive-all': this.getSettingRaw('show-archive-all', suppliedSettings) ?? true,
      'show-archive-toggle': this.getSettingRaw('show-archive-toggle', suppliedSettings) ?? true,
      'show-view-as-markdown':
        this.getSettingRaw('show-view-as-markdown', suppliedSettings) ?? true,
      'show-board-settings': this.getSettingRaw('show-board-settings', suppliedSettings) ?? true,
      'show-search': this.getSettingRaw('show-search', suppliedSettings) ?? true,
      'show-set-view': this.getSettingRaw('show-set-view', suppliedSettings) ?? true,
      'tag-colors': this.getSettingRaw('tag-colors', suppliedSettings) ?? [],
      'tag-sort': this.getSettingRaw('tag-sort', suppliedSettings) ?? [],
      'date-colors': this.getSettingRaw('date-colors', suppliedSettings) ?? [],
      'card-created-time-format': cardCreatedTimeFormat,
      'card-created-times': this.getSettingRaw('card-created-times', suppliedSettings) ?? {},
      'card-completed-time-format': cardCompletedTimeFormat,
      'card-completed-times': this.getSettingRaw('card-completed-times', suppliedSettings) ?? {},
      'show-card-created-time':
        this.getSettingRaw('show-card-created-time', suppliedSettings) ?? true,
      'show-card-created-time-in-complete-lane':
        this.getSettingRaw('show-card-created-time-in-complete-lane', suppliedSettings) ?? false,
      'show-card-completed-time-in-complete-lane':
        this.getSettingRaw('show-card-completed-time-in-complete-lane', suppliedSettings) ?? true,
      'tag-action': this.getSettingRaw('tag-action', suppliedSettings) ?? 'obsidian',
    };
  }

  getSetting = <K extends keyof KanbanSettings>(
    key: K,
    suppliedLocalSettings?: KanbanSettings
  ): KanbanSettings[K] => {
    if (suppliedLocalSettings?.[key] !== undefined) {
      return suppliedLocalSettings[key];
    }

    if (this.compiledSettings?.[key] !== undefined) {
      return this.compiledSettings[key];
    }

    return this.getSettingRaw(key);
  };

  getSettingRaw = <K extends keyof KanbanSettings>(
    key: K,
    suppliedLocalSettings?: KanbanSettings
  ): KanbanSettings[K] => {
    if (suppliedLocalSettings?.[key] !== undefined) {
      return suppliedLocalSettings[key];
    }

    if (this.state?.data?.settings?.[key] !== undefined) {
      return this.state.data.settings[key];
    }

    return this.getGlobalSetting(key);
  };

  getGlobalSetting = <K extends keyof KanbanSettings>(key: K): KanbanSettings[K] => {
    const globalSettings = this.getGlobalSettings();

    if (globalSettings?.[key] !== undefined) {
      return globalSettings[key];
    }

    return null;
  };

  getCompleteLaneOptions(board: Board = this.state): Array<{ lane: Lane; index: number }> {
    return board.children.reduce<Array<{ lane: Lane; index: number }>>((acc, lane, index) => {
      if (lane.data.shouldMarkItemsComplete) {
        acc.push({ lane, index });
      }

      return acc;
    }, []);
  }

  getDefaultCompleteLaneIndex(sourceLaneIndex?: number): number | null {
    const completeLanes = this.getCompleteLaneOptions();

    if (completeLanes.length === 1) {
      return completeLanes[0].index;
    }

    const sourceLaneId =
      sourceLaneIndex !== undefined ? this.state.children[sourceLaneIndex]?.id : undefined;
    const defaultLaneId =
      (sourceLaneId && this.getSetting('default-complete-lane-ids')?.[sourceLaneId]) ||
      this.getSetting('default-complete-lane-id');

    if (!defaultLaneId) {
      return null;
    }

    return completeLanes.find((option) => option.lane.id === defaultLaneId)?.index ?? null;
  }

  setDefaultCompleteLane(index: number, sourceLaneIndex?: number) {
    const lane = this.state.children[index];
    const sourceLane =
      sourceLaneIndex !== undefined ? this.state.children[sourceLaneIndex] : undefined;

    if (!lane?.data.shouldMarkItemsComplete) {
      return;
    }

    if (sourceLane && sourceLane.data.shouldMarkItemsComplete) {
      return;
    }

    if (sourceLane) {
      this.setState((board) =>
        update(board, {
          data: {
            settings: {
              'default-complete-lane-ids': {
                $set: {
                  ...(board.data.settings['default-complete-lane-ids'] || {}),
                  [sourceLane.id]: lane.id,
                },
              },
              $unset: ['default-complete-lane-titles'],
            },
          },
        })
      );

      return;
    }

    this.setState((board) =>
      update(board, {
        data: {
          settings: {
            'default-complete-lane-id': {
              $set: lane.id,
            },
            $unset: ['default-complete-lane-title'],
          },
        },
      })
    );
  }

  clearDefaultCompleteLane(sourceLaneIndex?: number) {
    const sourceLane =
      sourceLaneIndex !== undefined ? this.state.children[sourceLaneIndex] : undefined;

    if (sourceLane && sourceLane.data.shouldMarkItemsComplete) {
      return;
    }

    if (sourceLane) {
      this.setState((board) => {
        const nextIds = { ...(board.data.settings['default-complete-lane-ids'] || {}) };
        const hadSourceDefault = nextIds[sourceLane.id] !== undefined;

        delete nextIds[sourceLane.id];

        const settingsSpec: any = {
          'default-complete-lane-ids': {
            $set: nextIds,
          },
          $unset: ['default-complete-lane-titles'],
        };

        if (!hadSourceDefault) {
          return update(board, {
            data: {
              settings: {
                ...settingsSpec,
                $unset: ['default-complete-lane-id', 'default-complete-lane-title'],
              },
            },
          });
        }

        return update(board, {
          data: {
            settings: settingsSpec,
          },
        });
      });

      return;
    }

    this.setState((board) =>
      update(board, {
        data: {
          settings: {
            $unset: ['default-complete-lane-id', 'default-complete-lane-title'],
          },
        },
      })
    );
  }

  updateCompletedTime(board: Board, item: Item, isComplete: boolean) {
    const blockId = item.data.blockId;

    if (!blockId) {
      return board;
    }

    const nextCompletedTimes = { ...(board.data.settings['card-completed-times'] || {}) };

    if (isComplete) {
      if (nextCompletedTimes[blockId]) {
        return board;
      }

      nextCompletedTimes[blockId] = Date.now();

      return update(board, {
        data: {
          settings: {
            'card-completed-times': {
              $set: nextCompletedTimes,
            },
          },
        },
      });
    }

    if (!nextCompletedTimes[blockId]) {
      return board;
    }

    delete nextCompletedTimes[blockId];

    return update(board, {
      data: {
        settings: {
          'card-completed-times': {
            $set: nextCompletedTimes,
          },
        },
      },
    });
  }

  moveCompletedItemToLane(
    path: Path,
    replacements: Item[],
    completedIndex: number,
    laneIndex: number
  ) {
    if (!replacements[completedIndex] || path[0] === laneIndex) {
      return false;
    }

    this.setState((board) => {
      if (!board.children[path[0]]?.children[path[1]] || !board.children[laneIndex]) {
        return board;
      }

      const sourceLane = board.children[path[0]];
      const sourceItem = board.children[path[0]].children[path[1]];
      const blockId =
        sourceItem.data.blockId || replacements[completedIndex].data.blockId || generateInstanceId(6);
      const completedItem = update(replacements[completedIndex], {
        data: {
          blockId: {
            $set: blockId,
          },
        },
      });
      const sourceReplacements = replacements.filter((_, index) => index !== completedIndex);
      let nextBoard = removeEntity(board, path);

      if (sourceReplacements.length) {
        nextBoard = insertEntity(nextBoard, path, sourceReplacements);
      }

      const destinationLane = nextBoard.children[laneIndex];
      const insertionMethod = this.getSetting('completed-card-insertion-method');
      const destinationIndex = insertionMethod === 'append' ? destinationLane.children.length : 0;

      nextBoard = insertEntity(nextBoard, [laneIndex, destinationIndex], [completedItem]);
      nextBoard = this.updateCompletedTime(nextBoard, completedItem, true);

      nextBoard = update(nextBoard, {
        data: {
          settings: {
            'completed-card-sources': {
              $set: {
                ...(nextBoard.data.settings['completed-card-sources'] || {}),
                [blockId]: {
                  sourceLaneId: sourceLane.id,
                  sourceItemIndex: path[1],
                  movedAt: Date.now(),
                },
              },
            },
          },
        },
      });

      if (destinationLane.data.sorted !== undefined) {
        nextBoard = updateEntity(nextBoard, [laneIndex], {
          data: {
            $unset: ['sorted'],
          },
        });
      }

      return nextBoard;
    });

    return true;
  }

  moveItemBackToCompletedSourceLane(
    path: Path,
    replacements: Item[],
    completedIndex: number,
    originalItem: Item
  ) {
    const blockId = originalItem.data.blockId;
    const sourceRecord = blockId
      ? this.state.data.settings['completed-card-sources']?.[blockId]
      : null;

    if (!blockId || !sourceRecord) {
      return false;
    }

    const sourceLaneIndex = this.state.children.findIndex(
      (lane) => lane.id === sourceRecord.sourceLaneId
    );

    if (
      sourceLaneIndex < 0 ||
      sourceLaneIndex === path[0] ||
      this.state.children[sourceLaneIndex].data.shouldMarkItemsComplete
    ) {
      return false;
    }

    this.setState((board) => {
      if (!board.children[path[0]]?.children[path[1]] || !board.children[sourceLaneIndex]) {
        return board;
      }

      const returnedItem = update(replacements[completedIndex], {
        data: {
          blockId: {
            $set: blockId,
          },
        },
      });
      const sourceReplacements = replacements.filter((_, index) => index !== completedIndex);
      let nextBoard = removeEntity(board, path);

      if (sourceReplacements.length) {
        nextBoard = insertEntity(nextBoard, path, sourceReplacements);
      }

      const sourceLane = nextBoard.children[sourceLaneIndex];
      const destinationIndex = Math.min(
        sourceRecord.sourceItemIndex ?? sourceLane.children.length,
        sourceLane.children.length
      );

      nextBoard = insertEntity(nextBoard, [sourceLaneIndex, destinationIndex], [returnedItem]);
      nextBoard = this.updateCompletedTime(nextBoard, returnedItem, false);

      const nextSources = { ...(nextBoard.data.settings['completed-card-sources'] || {}) };
      delete nextSources[blockId];

      return update(nextBoard, {
        data: {
          settings: {
            'completed-card-sources': {
              $set: nextSources,
            },
          },
        },
      });
    });

    return true;
  }

  clearCompletedCardSource(item: Item) {
    this.clearCompletedCardSourceByBlockId(item.data.blockId);
  }

  clearCompletedCardSourceByBlockId(blockId?: string) {
    if (!blockId || !this.state.data.settings['completed-card-sources']?.[blockId]) {
      return;
    }

    this.setState((board) => {
      const nextSources = { ...(board.data.settings['completed-card-sources'] || {}) };
      delete nextSources[blockId];

      return update(board, {
        data: {
          settings: {
            'completed-card-sources': {
              $set: nextSources,
            },
          },
        },
      });
    });
  }

  moveItemToLane(path: Path, laneIndex: number) {
    this.setState((board) => {
      const item = board.children[path[0]]?.children[path[1]];

      if (!item || path[0] === laneIndex || !board.children[laneIndex]) {
        return board;
      }

      let nextBoard = moveEntity(board, path, [laneIndex, 0]);
      const blockId = item.data.blockId;

      if (blockId && nextBoard.data.settings['completed-card-sources']?.[blockId]) {
        const nextSources = { ...nextBoard.data.settings['completed-card-sources'] };
        delete nextSources[blockId];

        nextBoard = update(nextBoard, {
          data: {
            settings: {
              'completed-card-sources': {
                $set: nextSources,
              },
            },
          },
        });
      }

      return nextBoard;
    });
  }

  getParsedBoard(data: string) {
    const trimmedContent = data.trim();

    let board: Board = {
      ...BoardTemplate,
      id: this.file.path,
      children: [],
      data: {
        archive: [],
        settings: { [frontmatterKey]: 'board' },
        frontmatter: {},
        isSearching: false,
        errors: [],
      },
    };

    try {
      if (trimmedContent) {
        board = this.parser.mdToBoard(trimmedContent);
      }
    } catch (e) {
      console.error(e);

      board = update(board, {
        data: {
          errors: {
            $push: [{ description: e.toString(), stack: e.stack }],
          },
        },
      });
    }

    return board;
  }

  setError(e: Error) {
    this.setState(
      update(this.state, {
        data: {
          errors: {
            $push: [{ description: e.toString(), stack: e.stack }],
          },
        },
      }),
      false
    );
  }

  onFileMetadataChange() {
    this.reparseBoardFromMd();
  }

  async reparseBoardFromMd() {
    try {
      this.setState(this.getParsedBoard(this.getAView().data), false);
    } catch (e) {
      console.error(e);
      this.setError(e);
    }
  }

  async archiveCompletedCards() {
    const board = this.state;

    const archived: Array<{
      item: Item;
      sourceLane: Lane;
      sourceItemIndex: number;
    }> = [];
    const shouldAppendArchiveDate = !!this.getSetting('archive-with-date');
    const archiveDateSeparator = this.getSetting('archive-date-separator');
    const archiveDateFormat = this.getSetting('archive-date-format');
    const archiveDateAfterTitle = this.getSetting('append-archive-date');

    const appendArchiveDate = (item: Item) => {
      const newTitle = [moment().format(archiveDateFormat)];

      if (archiveDateSeparator) newTitle.push(archiveDateSeparator);

      newTitle.push(item.data.titleRaw);

      if (archiveDateAfterTitle) newTitle.reverse();

      const titleRaw = newTitle.join(' ');

      return this.parser.updateItemContent(item, titleRaw);
    };

    const lanes = board.children.map((lane, sourceLaneIndex) => {
      return update(lane, {
        children: {
          $set: lane.children.filter((item, sourceItemIndex) => {
            const isComplete = item.data.checked && item.data.checkChar === getTaskStatusDone();
            if (lane.data.shouldMarkItemsComplete || isComplete) {
              archived.push({ item, sourceLane: lane, sourceItemIndex });
            }

            return !isComplete && !lane.data.shouldMarkItemsComplete;
          }),
        },
      });
    });

    const archivedAt = Date.now();
    const archivedSources: NonNullable<KanbanSettings['archived-card-sources']> = {};
    const archivedItems = await Promise.all(
      archived.map(({ item, sourceLane, sourceItemIndex }) => {
        const blockId = item.data.blockId || generateInstanceId(6);
        const itemWithBlockId = item.data.blockId
          ? item
          : update<Item>(item, { data: { blockId: { $set: blockId } } });

        archivedSources[blockId] = {
          sourceLaneId: sourceLane.id,
          sourceItemIndex,
          archivedAt,
          archiveDateFormat,
          archiveDateSeparator,
          archiveDateAfterTitle,
        };

        return shouldAppendArchiveDate ? appendArchiveDate(itemWithBlockId) : itemWithBlockId;
      })
    );

    try {
      this.setState(
        update(board, {
          children: {
            $set: lanes,
          },
          data: {
            settings: {
              'archived-card-sources': {
                $set: {
                  ...(board.data.settings['archived-card-sources'] || {}),
                  ...archivedSources,
                },
              },
            },
            archive: {
              $push: archivedItems,
            },
          },
        })
      );
    } catch (e) {
      this.setError(e);
    }
  }

  getNewItem(content: string, checkChar: string, forceEdit?: boolean) {
    return this.parser.newItem(content, checkChar, forceEdit);
  }

  updateItemContent(item: Item, content: string) {
    return this.parser.updateItemContent(item, content);
  }
}
