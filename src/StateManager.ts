import update from 'immutability-helper';
import { App, TFile, moment } from 'obsidian';
import { useEffect, useState } from 'preact/compat';

import { KanbanView } from './KanbanView';
import { KanbanSettings, SettingRetrievers, noDefaultCompleteLaneId } from './Settings';
import {
  generateInstanceId,
  getDefaultDateFormat,
  getDefaultTimeFormat,
} from './components/helpers';
import {
  Board,
  BoardTemplate,
  Item,
  Lane,
  LaneSort,
  completedTimeDescSortRule,
} from './components/types';
import { Path } from './dnd/types';
import { insertEntity, moveEntity, removeEntity, updateEntity } from './dnd/util/data';
import { defaultArchiveDateSeparator, getArchiveDateText } from './helpers/archiveDate';
import { getCard, getCompletedCardSource, sanitizeCards, updateCard } from './helpers/cardSettings';
import { asError } from './helpers/unknown';
import { defaultSort } from './helpers/util';
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

    void this.registerView(initialView, initialData, true);
  }

  getAView(): KanbanView {
    return this.viewSet.values().next().value as KanbanView;
  }

  hasError(): boolean {
    return !!this.state?.data?.errors?.length;
  }

  async registerView(view: KanbanView, data: string, shouldParseData: boolean) {
    if (!this.viewSet.has(view)) {
      this.viewSet.add(view);
    }

    // This helps delay blocking the UI until the the loading indicator is displayed
    await new Promise((res) => window.setTimeout(res, 10));

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
      this.setError(asError(e));
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
        this.setError(asError(e));
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
      this.setError(asError(e));
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
      this.getSettingRaw('archive-date-format', suppliedSettings) || 'YYYY-MM-DD HH:mm:ss';
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
      'archive-date-separator':
        this.getSettingRaw('archive-date-separator', suppliedSettings) ?? defaultArchiveDateSeparator,
      'archive-date-format': archiveDateFormat,
      'show-add-list': this.getSettingRaw('show-add-list', suppliedSettings) ?? true,
      'show-archive-all': this.getSettingRaw('show-archive-all', suppliedSettings) ?? true,
      'show-archive-toggle': this.getSettingRaw('show-archive-toggle', suppliedSettings) ?? true,
      'show-card-archive-time-in-archive-lane':
        this.getSettingRaw('show-card-archive-time-in-archive-lane', suppliedSettings) ?? true,
      'show-view-as-markdown':
        this.getSettingRaw('show-view-as-markdown', suppliedSettings) ?? true,
      'show-board-settings': this.getSettingRaw('show-board-settings', suppliedSettings) ?? true,
      'show-toggle-all-card-created-times':
        this.getSettingRaw('show-toggle-all-card-created-times', suppliedSettings) ?? true,
      'show-toggle-all-card-completed-times':
        this.getSettingRaw('show-toggle-all-card-completed-times', suppliedSettings) ?? true,
      'group-cards-by-created-time':
        this.getSettingRaw('group-cards-by-created-time', suppliedSettings) ?? true,
      'group-cards-by-completed-time':
        this.getSettingRaw('group-cards-by-completed-time', suppliedSettings) ?? true,
      'show-search': this.getSettingRaw('show-search', suppliedSettings) ?? true,
      'show-set-view': this.getSettingRaw('show-set-view', suppliedSettings) ?? true,
      'tag-colors': this.getSettingRaw('tag-colors', suppliedSettings) ?? [],
      'tag-sort': this.getSettingRaw('tag-sort', suppliedSettings) ?? [],
      'date-colors': this.getSettingRaw('date-colors', suppliedSettings) ?? [],
      cards: sanitizeCards(this.getSettingRaw('cards', suppliedSettings)) ?? [],
      'card-created-time-format': cardCreatedTimeFormat,
      'card-completed-time-format': cardCompletedTimeFormat,
      'show-card-created-time':
        this.getSettingRaw('show-card-created-time', suppliedSettings) ?? true,
      'show-card-created-time-in-complete-lane':
        this.getSettingRaw('show-card-created-time-in-complete-lane', suppliedSettings) ?? false,
      'show-card-completed-time-in-complete-lane':
        this.getSettingRaw('show-card-completed-time-in-complete-lane', suppliedSettings) ?? true,
      'show-checkboxes': this.getSettingRaw('show-checkboxes', suppliedSettings) ?? true,
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

  getDefaultCompleteLaneIndex(sourceLaneIndex?: number): number | null | typeof noDefaultCompleteLaneId {
    const completeLanes = this.getCompleteLaneOptions();
    const sourceLaneId =
      sourceLaneIndex !== undefined ? this.state.children[sourceLaneIndex]?.id : undefined;
    const defaultLaneId =
      (sourceLaneIndex !== undefined &&
        this.state.children[sourceLaneIndex]?.data.defaultCompleteLaneId) ||
      (sourceLaneId && this.getSetting('default-complete-lane-ids')?.[sourceLaneId]) ||
      this.getSetting('default-complete-lane-id');

    if (!defaultLaneId) {
      return null;
    }

    if (defaultLaneId === noDefaultCompleteLaneId) {
      return noDefaultCompleteLaneId;
    }

    if (completeLanes.length === 1) {
      return completeLanes[0].index;
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
        updateEntity(board, [sourceLaneIndex], {
          data: {
            defaultCompleteLaneId: {
              $set: lane.id,
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
      this.setState((board) =>
        updateEntity(board, [sourceLaneIndex], {
          data: {
            $unset: ['defaultCompleteLaneId'],
          },
        })
      );

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

  setNoDefaultCompleteLane(sourceLaneIndex?: number) {
    const sourceLane =
      sourceLaneIndex !== undefined ? this.state.children[sourceLaneIndex] : undefined;

    if (sourceLane && sourceLane.data.shouldMarkItemsComplete) {
      return;
    }

    if (sourceLane) {
      this.setState((board) =>
        updateEntity(board, [sourceLaneIndex], {
          data: {
            defaultCompleteLaneId: {
              $set: noDefaultCompleteLaneId,
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
              $set: noDefaultCompleteLaneId,
            },
            $unset: ['default-complete-lane-title'],
          },
        },
      })
    );
  }

  completeItemInPlace(
    path: Path,
    replacements: Item[],
    completedIndex: number,
    isComplete = true
  ) {
    if (!replacements[completedIndex]) {
      return false;
    }

    this.setState((board) => {
      if (!board.children[path[0]]?.children[path[1]]) {
        return board;
      }

      const sourceItem = board.children[path[0]].children[path[1]];
      const blockId =
        sourceItem.data.blockId ||
        replacements[completedIndex].data.blockId ||
        generateInstanceId(6);
      const completedItem = update(replacements[completedIndex], {
        data: {
          blockId: {
            $set: blockId,
          },
        },
      });
      let nextBoard: Board;

      if (replacements.length === 1) {
        nextBoard = removeEntity(board, path, completedItem) as Board;
      } else {
        const nextReplacements = replacements.slice();
        nextReplacements[completedIndex] = completedItem;

        nextBoard = removeEntity(board, path) as Board;
        nextBoard = insertEntity(nextBoard, path, nextReplacements) as Board;
      }

      if (isComplete && !nextBoard.children[path[0]]?.data.shouldMarkItemsComplete) {
        nextBoard = updateEntity(nextBoard, [path[0]], {
          data: {
            showCompletedTime: {
              $set: true,
            },
          },
        }) as Board;
      }

      return this.updateCompletedTime(nextBoard, completedItem, isComplete);
    });

    return true;
  }

  updateItemCompletionInPlace(
    path: Path,
    replacements: Item[],
    completedIndex: number,
    isComplete: boolean
  ) {
    if (!replacements[completedIndex]) {
      return false;
    }

    this.setState((board) => {
      if (!board.children[path[0]]?.children[path[1]]) {
        return board;
      }

      const sourceItem = board.children[path[0]].children[path[1]];
      const blockId =
        sourceItem.data.blockId ||
        replacements[completedIndex].data.blockId ||
        generateInstanceId(6);
      const completedItem = update(replacements[completedIndex], {
        data: {
          blockId: {
            $set: blockId,
          },
        },
      });
      let nextBoard: Board;

      if (replacements.length === 1) {
        nextBoard = removeEntity(board, path, completedItem) as Board;
      } else {
        const nextReplacements = replacements.slice();
        nextReplacements[completedIndex] = completedItem;

        nextBoard = removeEntity(board, path) as Board;
        nextBoard = insertEntity(nextBoard, path, nextReplacements) as Board;
      }

      if (isComplete) {
        nextBoard = updateEntity(nextBoard, [path[0]], {
          data: {
            showCompletedTime: {
              $set: true,
            },
          },
        }) as Board;
      }

      return this.updateCompletedTime(nextBoard, completedItem, isComplete);
    });

    return true;
  }

  updateCompletedTime(board: Board, item: Item, isComplete: boolean) {
    const blockId = item.data.blockId;

    if (!blockId) {
      return board;
    }

    if (isComplete) {
      if (getCard(board.data.settings, blockId)?.['completed-time']) {
        return board;
      }

      return update(board, {
        data: {
          settings: {
            cards: {
              $set: updateCard(board.data.settings, blockId, (card) => ({
                ...card,
                'completed-time': Date.now(),
              })),
            },
          },
        },
      });
    }

    if (!getCard(board.data.settings, blockId)?.['completed-time']) {
      return board;
    }

    return update(board, {
      data: {
        settings: {
          cards: {
              $set: updateCard(board.data.settings, blockId, (card) => {
              const nextCard = { ...card };
              delete nextCard['completed-time'];
              delete nextCard.sourceLaneId;
              delete nextCard.sourceItemIndex;
              delete nextCard.targetLaneId;

                return nextCard;
            }),
          },
        },
      },
    });
  }

  getLaneSortFromRule(lane: Lane): LaneSort | string {
    const sortRule = lane.data.sortRule || completedTimeDescSortRule;

    if (sortRule.type === 'manual') {
      return 'manual';
    }

    switch (`${sortRule.type}:${sortRule.order}`) {
      case 'card-text:asc':
        return LaneSort.TitleAsc;
      case 'card-text:desc':
        return LaneSort.TitleDsc;
      case 'date:asc':
        return LaneSort.DateAsc;
      case 'date:desc':
        return LaneSort.DateDsc;
      case 'tags:asc':
        return LaneSort.TagsAsc;
      case 'tags:desc':
        return LaneSort.TagsDsc;
      case 'created-time:asc':
        return LaneSort.CreatedAsc;
      case 'created-time:desc':
        return LaneSort.CreatedDsc;
      case 'completed-time:asc':
        return LaneSort.CompletedAsc;
      case 'completed-time:desc':
        return LaneSort.CompletedDsc;
      default:
        return `${sortRule.type}-${sortRule.order}`;
    }
  }

  sortCompletedLaneByCurrentRule(board: Board, laneIndex: number) {
    const lane = board.children[laneIndex];

    if (!lane?.data.shouldMarkItemsComplete) {
      return board;
    }

    const sorted = this.getLaneSortFromRule(lane);
    const sortRule = lane.data.sortRule || completedTimeDescSortRule;

    if (sortRule.type === 'manual') {
      return updateEntity(board, [laneIndex], {
        data: {
          sortRule: {
            $set: sortRule,
          },
          $unset: ['sorted'],
        },
      });
    }

    const direction = sortRule.order === 'desc' ? -1 : 1;
    const cards = sanitizeCards(board.data.settings.cards) || [];
    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const children = lane.children.slice().sort((a, b) => {
      switch (sorted) {
        case LaneSort.TitleAsc:
          return a.data.title.localeCompare(b.data.title);
        case LaneSort.TitleDsc:
          return b.data.title.localeCompare(a.data.title);
        case LaneSort.DateAsc:
        case LaneSort.DateDsc: {
          const aDate = a.data.metadata.time || a.data.metadata.date;
          const bDate = b.data.metadata.time || b.data.metadata.date;

          if (aDate && !bDate) return -1 * direction;
          if (bDate && !aDate) return 1 * direction;
          if (!aDate && !bDate) return 0;

          return (aDate.isBefore(bDate) ? -1 : 1) * direction;
        }
        case LaneSort.TagsAsc:
        case LaneSort.TagsDsc: {
          const tagsA = a.data.metadata.tags;
          const tagsB = b.data.metadata.tags;

          if (!tagsA?.length && !tagsB?.length) return 0;
          if (!tagsA?.length) return 1;
          if (!tagsB?.length) return -1;

          return defaultSort(tagsA.join(''), tagsB.join('')) * direction;
        }
        case LaneSort.CreatedAsc:
        case LaneSort.CreatedDsc: {
          const aTime = a.data.blockId ? cardMap.get(a.data.blockId)?.['created-time'] : undefined;
          const bTime = b.data.blockId ? cardMap.get(b.data.blockId)?.['created-time'] : undefined;

          if (aTime && !bTime) return -1;
          if (bTime && !aTime) return 1;
          if (!aTime && !bTime) return 0;

          return (aTime - bTime) * direction;
        }
        case LaneSort.CompletedAsc:
        case LaneSort.CompletedDsc: {
          const aTime = a.data.blockId ? cardMap.get(a.data.blockId)?.['completed-time'] : undefined;
          const bTime = b.data.blockId ? cardMap.get(b.data.blockId)?.['completed-time'] : undefined;

          if (aTime && !bTime) return -1;
          if (bTime && !aTime) return 1;
          if (!aTime && !bTime) return 0;

          return (aTime - bTime) * direction;
        }
      }

      if (typeof sorted !== 'string') {
        return 0;
      }

      const metadataKey = sorted.replace(/-(?:asc|desc)$/, '');
      const aValue = a.data.metadata.inlineMetadata?.find((m) => m.key === metadataKey)?.value;
      const bValue = b.data.metadata.inlineMetadata?.find((m) => m.key === metadataKey)?.value;

      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      return defaultSort(String(aValue), String(bValue)) * direction;
    });

    return updateEntity(board, [laneIndex], {
      children: {
        $set: children,
      },
      data: {
        sorted: {
          $set: sorted,
        },
        sortRule: {
          $set: sortRule,
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
        sourceItem.data.blockId ||
        replacements[completedIndex].data.blockId ||
        generateInstanceId(6);
      const completedItem = update(replacements[completedIndex], {
        data: {
          blockId: {
            $set: blockId,
          },
        },
      });
      const sourceReplacements = replacements.filter((_, index) => index !== completedIndex);
      let nextBoard = removeEntity(board, path) as Board;

      if (sourceReplacements.length) {
        nextBoard = insertEntity(nextBoard, path, sourceReplacements) as Board;
      }

      const destinationLane = nextBoard.children[laneIndex];
      const shouldPrependInManualCompleteLane =
        destinationLane.data.shouldMarkItemsComplete &&
        destinationLane.data.sortRule?.type === 'manual' &&
        (this.getSetting('manual-completed-card-insertion-method') || 'prepend') === 'prepend';
      const destinationIndex = shouldPrependInManualCompleteLane
        ? 0
        : destinationLane.children.length;

      nextBoard = insertEntity(nextBoard, [laneIndex, destinationIndex], [completedItem]) as Board;
      nextBoard = this.updateCompletedTime(nextBoard, completedItem, true);

      nextBoard = update(nextBoard, {
        data: {
          settings: {
            cards: {
              $set: updateCard(nextBoard.data.settings, blockId, (card) => ({
                ...card,
                sourceLaneId: sourceLane.id,
                sourceItemIndex: path[1],
                targetLaneId: destinationLane.id,
              })),
            },
          },
        },
      });

      return this.sortCompletedLaneByCurrentRule(nextBoard, laneIndex);
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
    const sourceRecord = getCompletedCardSource(this.state.data.settings, blockId);

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
      let nextBoard = removeEntity(board, path) as Board;

      if (sourceReplacements.length) {
        nextBoard = insertEntity(nextBoard, path, sourceReplacements) as Board;
      }

      const sourceLane = nextBoard.children[sourceLaneIndex];
      const destinationIndex = Math.min(
        sourceRecord.sourceItemIndex ?? sourceLane.children.length,
        sourceLane.children.length
      );

      nextBoard = insertEntity(nextBoard, [sourceLaneIndex, destinationIndex], [returnedItem]) as Board;
      nextBoard = this.updateCompletedTime(nextBoard, returnedItem, false);

      return update(nextBoard, {
        data: {
          settings: {
            cards: {
              $set: updateCard(nextBoard.data.settings, blockId, (card) => {
                const nextCard = { ...card };
                delete nextCard.sourceLaneId;
                delete nextCard.sourceItemIndex;
                delete nextCard.targetLaneId;
                return nextCard;
              }),
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
    if (!blockId || !getCompletedCardSource(this.state.data.settings, blockId)) {
      return;
    }

    this.setState((board) => {
      return update(board, {
        data: {
          settings: {
            cards: {
              $set: updateCard(board.data.settings, blockId, (card) => {
                const nextCard = { ...card };
                delete nextCard.sourceLaneId;
                delete nextCard.sourceItemIndex;
                delete nextCard.targetLaneId;
                return nextCard;
              }),
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

      let nextBoard = moveEntity(board, path, [laneIndex, 0]) as Board;
      const blockId = item.data.blockId;

      if (blockId && getCompletedCardSource(nextBoard.data.settings, blockId)) {
        nextBoard = update(nextBoard, {
          data: {
            settings: {
              cards: {
                $set: updateCard(nextBoard.data.settings, blockId, (card) => {
                  const nextCard = { ...card };
                  delete nextCard.sourceLaneId;
                  delete nextCard.sourceItemIndex;
                  delete nextCard.targetLaneId;
                  return nextCard;
                }),
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
            $push: [{ description: asError(e).toString(), stack: asError(e).stack }],
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
    void this.reparseBoardFromMd();
  }

  async reparseBoardFromMd() {
    try {
      this.setState(this.getParsedBoard(this.getAView().data), false);
    } catch (e) {
      console.error(e);
      this.setError(asError(e));
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
    const archiveDateFormat =
      this.getSetting('archive-date-format') || 'YYYY-MM-DD HH:mm:ss';
    const archiveDateAfterTitle = this.getSetting('append-archive-date');

    const appendArchiveDate = (item: Item, archivedAt: number) => {
      const newTitle = [
        getArchiveDateText({
          archiveDate: moment(archivedAt).format(archiveDateFormat),
          archiveDateSeparator,
          archiveDateAfterTitle,
        }),
      ];

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
    let nextCards = sanitizeCards(board.data.settings.cards) || [];
    const archivedItems = archived.map(({ item, sourceLane, sourceItemIndex }) => {
        const blockId = item.data.blockId || generateInstanceId(6);
        const itemWithBlockId = item.data.blockId
          ? item
          : update<Item>(item, { data: { blockId: { $set: blockId } } });

        nextCards = updateCard({ ...board.data.settings, cards: nextCards }, blockId, (card) => ({
          ...card,
          archived: {
            sourceLaneId: sourceLane.id,
            sourceItemIndex,
            archivedAt,
            archiveDateFormat,
            archiveDateSeparator,
            archiveDateAfterTitle,
          },
        }));

        return shouldAppendArchiveDate ? appendArchiveDate(itemWithBlockId, archivedAt) : itemWithBlockId;
      });

    try {
      this.setState(
        update(board, {
          children: {
            $set: lanes,
          },
          data: {
            settings: {
              cards: {
                $set: nextCards,
              },
            },
            archive: {
              $push: archivedItems,
            },
          },
        })
      );
    } catch (e) {
      this.setError(asError(e));
    }
  }

  getNewItem(content: string, checkChar: string, forceEdit?: boolean) {
    return this.parser.newItem(content, checkChar, forceEdit);
  }

  updateItemContent(item: Item, content: string) {
    return this.parser.updateItemContent(item, content);
  }
}
