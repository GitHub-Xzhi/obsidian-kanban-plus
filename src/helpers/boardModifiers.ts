import update from 'immutability-helper';
import { Notice, moment } from 'obsidian';
import { KanbanView } from 'src/KanbanView';
import { KanbanSettings } from 'src/Settings';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import {
  appendEntities,
  getEntityFromPath,
  insertEntity,
  moveEntity,
  prependEntities,
  removeEntity,
  updateEntity,
  updateParentEntity,
} from 'src/dnd/util/data';
import { t } from 'src/lang/helpers';
import { getTaskStatusDone } from 'src/parsers/helpers/inlineMetadata';

import { escapeRegExpStr, generateInstanceId } from '../components/helpers';
import { Board, DataTypes, Item, Lane } from '../components/types';

export interface BoardModifiers {
  appendItems: (path: Path, items: Item[]) => void;
  prependItems: (path: Path, items: Item[]) => void;
  insertItems: (path: Path, items: Item[]) => void;
  replaceItem: (path: Path, items: Item[]) => void;
  splitItem: (path: Path, items: Item[]) => void;
  moveItemToTop: (path: Path) => void;
  moveItemToBottom: (path: Path) => void;
  addLane: (lane: Lane) => void;
  insertLane: (path: Path, lane: Lane) => void;
  updateLane: (path: Path, lane: Lane) => void;
  archiveLane: (path: Path) => void;
  archiveLaneItems: (path: Path) => void;
  deleteEntity: (path: Path) => void;
  updateItem: (path: Path, item: Item) => void;
  archiveItem: (path: Path) => void;
  unarchiveItem: (archiveIndex: number) => void;
  duplicateEntity: (path: Path) => void;
}

type ArchivedCardSources = NonNullable<KanbanSettings['archived-card-sources']>;
type CardCreatedTimes = NonNullable<KanbanSettings['card-created-times']>;
type CardCompletedTimes = NonNullable<KanbanSettings['card-completed-times']>;

export function getBoardModifiers(view: KanbanView, stateManager: StateManager): BoardModifiers {
  const getArchiveDateSettings = () => {
    return {
      archiveDateFormat: stateManager.getSetting('archive-date-format'),
      archiveDateSeparator: stateManager.getSetting('archive-date-separator'),
      archiveDateAfterTitle: stateManager.getSetting('append-archive-date'),
    };
  };

  const getArchiveDateText = ({
    archiveDateFormat,
    archiveDateSeparator,
    archiveDateAfterTitle,
    archivedAt,
  }: {
    archiveDateFormat: string;
    archiveDateSeparator?: string;
    archiveDateAfterTitle?: boolean;
    archivedAt: number;
  }) => {
    const archiveDate = moment(archivedAt).format(archiveDateFormat);

    if (!archiveDateSeparator) {
      return archiveDate;
    }

    return archiveDateAfterTitle
      ? `${archiveDateSeparator} ${archiveDate}`
      : `${archiveDate} ${archiveDateSeparator}`;
  };

  const appendArchiveDate = (item: Item, archivedAt: number = Date.now()) => {
    const archiveDateSettings = getArchiveDateSettings();
    const archiveDateAfterTitle = archiveDateSettings.archiveDateAfterTitle;
    const newTitle = [
      getArchiveDateText({
        ...archiveDateSettings,
        archivedAt,
      }),
    ];

    newTitle.push(item.data.titleRaw);

    if (archiveDateAfterTitle) newTitle.reverse();

    const titleRaw = newTitle.join(' ');
    return stateManager.updateItemContent(item, titleRaw);
  };

  const removeArchiveDate = (item: Item, source: ArchivedCardSources[string]) => {
    const archivedAt = source.archivedAt;

    if (!stateManager.getSetting('archive-with-date') || !archivedAt) {
      return item;
    }

    const fallbackSettings = getArchiveDateSettings();
    const archiveDateFormat = source.archiveDateFormat || fallbackSettings.archiveDateFormat;
    const archiveDateSeparator =
      source.archiveDateSeparator ?? fallbackSettings.archiveDateSeparator;
    const archiveDateAfterTitle =
      source.archiveDateAfterTitle ?? fallbackSettings.archiveDateAfterTitle;
    const archiveText = getArchiveDateText({
      archiveDateFormat,
      archiveDateSeparator,
      archiveDateAfterTitle,
      archivedAt,
    });
    const archiveRegExp = archiveDateAfterTitle
      ? new RegExp(`\\s+${escapeRegExpStr(archiveText)}$`)
      : new RegExp(`^${escapeRegExpStr(archiveText)}\\s+`);
    const titleRaw = item.data.titleRaw.replace(archiveRegExp, '').trim();

    return titleRaw === item.data.titleRaw ? item : stateManager.updateItemContent(item, titleRaw);
  };

  const collectBlockIds = (entity: Item | Lane): string[] => {
    if (entity.type === DataTypes.Item) {
      return entity.data.blockId ? [entity.data.blockId] : [];
    }

    return entity.children.flatMap(collectBlockIds);
  };

  const applySettingsSpec = (boardData: Board, settingsSpec: any) => {
    return Object.keys(settingsSpec).length
      ? update<Board>(boardData, { data: { settings: settingsSpec } })
      : boardData;
  };

  const addCreatedTimes = (boardData: Board, items: Item[]) => {
    const createdAt = Date.now();
    const nextCreatedTimes: CardCreatedTimes = {
      ...(boardData.data.settings['card-created-times'] || {}),
    };
    let didUpdateCreatedTimes = false;

    const nextItems = items.map((item) => {
      const blockId = item.data.blockId || generateInstanceId(6);
      const itemWithBlockId = item.data.blockId
        ? item
        : update<Item>(item, { data: { blockId: { $set: blockId } } });

      if (!nextCreatedTimes[blockId]) {
        nextCreatedTimes[blockId] = createdAt;
        didUpdateCreatedTimes = true;
      }

      return itemWithBlockId;
    });

    return {
      items: nextItems,
      settingsSpec: didUpdateCreatedTimes
        ? { 'card-created-times': { $set: nextCreatedTimes } }
        : {},
    };
  };

  const updateCompletedTimes = (boardData: Board, items: Item[]) => {
    const nextCompletedTimes: CardCompletedTimes = {
      ...(boardData.data.settings['card-completed-times'] || {}),
    };
    let didUpdateCompletedTimes = false;

    items.forEach((item) => {
      const blockId = item.data.blockId;

      if (!blockId) {
        return;
      }

      const isComplete = item.data.checked && item.data.checkChar === getTaskStatusDone();

      if (isComplete && !nextCompletedTimes[blockId]) {
        nextCompletedTimes[blockId] = Date.now();
        didUpdateCompletedTimes = true;
      } else if (!isComplete && nextCompletedTimes[blockId]) {
        delete nextCompletedTimes[blockId];
        didUpdateCompletedTimes = true;
      }
    });

    return didUpdateCompletedTimes ? { 'card-completed-times': { $set: nextCompletedTimes } } : {};
  };

  const archiveItemsWithSources = (
    items: Item[],
    sourceLane: Lane,
    getSourceItemIndex: (itemIndex: number) => number
  ) => {
    const archivedAt = Date.now();
    const archiveDateSettings = getArchiveDateSettings();
    const sources: ArchivedCardSources = {};
    const archivedItems = items.map((item, itemIndex) => {
      const blockId = item.data.blockId || generateInstanceId(6);
      const itemWithBlockId = item.data.blockId
        ? item
        : update<Item>(item, { data: { blockId: { $set: blockId } } });

      sources[blockId] = {
        sourceLaneId: sourceLane.id,
        sourceItemIndex: getSourceItemIndex(itemIndex),
        archivedAt,
        ...archiveDateSettings,
      };

      return stateManager.getSetting('archive-with-date')
        ? appendArchiveDate(itemWithBlockId, archivedAt)
        : itemWithBlockId;
    });

    return { items: archivedItems, sources };
  };

  const updateArchivedSources = (boardData: Board, sources: ArchivedCardSources) => {
    if (!Object.keys(sources).length) {
      return boardData;
    }

    return update<Board>(boardData, {
      data: {
        settings: {
          'archived-card-sources': {
            $set: {
              ...(boardData.data.settings['archived-card-sources'] || {}),
              ...sources,
            },
          },
        },
      },
    });
  };

  const findArchivedSourceLaneIndex = (boardData: Board, source: ArchivedCardSources[string]) => {
    return boardData.children.findIndex((lane) => lane.id === source.sourceLaneId);
  };

  const clearDeletedEntityReferences = (boardData: Board, entity: Item | Lane, path: Path) => {
    const blockIds = collectBlockIds(entity);
    const sources = boardData.data.settings['completed-card-sources'];
    const archiveSources = boardData.data.settings['archived-card-sources'];
    const createdTimes = boardData.data.settings['card-created-times'];
    const completedTimes = boardData.data.settings['card-completed-times'];
    const defaultCompleteLaneIds = boardData.data.settings['default-complete-lane-ids'];
    const defaultCompleteLaneId = boardData.data.settings['default-complete-lane-id'];

    if (
      !sources &&
      !archiveSources &&
      !createdTimes &&
      !completedTimes &&
      !defaultCompleteLaneIds &&
      !defaultCompleteLaneId &&
      entity.type !== DataTypes.Lane
    ) {
      return boardData;
    }

    const deletedLaneId = entity.type === DataTypes.Lane ? entity.id : null;
    const nextSources = sources ? { ...sources } : undefined;
    const nextArchiveSources = archiveSources ? { ...archiveSources } : undefined;
    const nextCreatedTimes = createdTimes ? { ...createdTimes } : undefined;
    const nextCompletedTimes = completedTimes ? { ...completedTimes } : undefined;
    let didUpdateSources = false;
    let didUpdateArchiveSources = false;
    let didUpdateCreatedTimes = false;
    let didUpdateCompletedTimes = false;

    if (nextSources) {
      for (const blockId of blockIds) {
        if (nextSources[blockId]) {
          delete nextSources[blockId];
          didUpdateSources = true;
        }
      }

      if (entity.type === DataTypes.Lane) {
        Object.entries(nextSources).forEach(([blockId, source]) => {
          if (source.sourceLaneId === deletedLaneId) {
            delete nextSources[blockId];
            didUpdateSources = true;
          }
        });
      }
    }

    if (nextArchiveSources) {
      for (const blockId of blockIds) {
        if (nextArchiveSources[blockId]) {
          delete nextArchiveSources[blockId];
          didUpdateArchiveSources = true;
        }
      }
    }

    if (nextCreatedTimes) {
      for (const blockId of blockIds) {
        if (nextCreatedTimes[blockId]) {
          delete nextCreatedTimes[blockId];
          didUpdateCreatedTimes = true;
        }
      }
    }

    if (nextCompletedTimes) {
      for (const blockId of blockIds) {
        if (nextCompletedTimes[blockId]) {
          delete nextCompletedTimes[blockId];
          didUpdateCompletedTimes = true;
        }
      }
    }

    if (entity.type !== DataTypes.Lane) {
      const settingsSpec: any = {};

      if (didUpdateSources) {
        settingsSpec['completed-card-sources'] = { $set: nextSources };
      }

      if (didUpdateArchiveSources) {
        settingsSpec['archived-card-sources'] = { $set: nextArchiveSources };
      }

      if (didUpdateCreatedTimes) {
        settingsSpec['card-created-times'] = { $set: nextCreatedTimes };
      }

      if (didUpdateCompletedTimes) {
        settingsSpec['card-completed-times'] = { $set: nextCompletedTimes };
      }

      return applySettingsSpec(boardData, settingsSpec);
    }

    const laneBackgroundColors = boardData.data.settings['lane-background-colors'];
    const settingsSpec: any = {};
    const unsetSettings: string[] = [];

    if (didUpdateSources) {
      settingsSpec['completed-card-sources'] = { $set: nextSources };
    }

    if (didUpdateArchiveSources) {
      settingsSpec['archived-card-sources'] = { $set: nextArchiveSources };
    }

    if (didUpdateCreatedTimes) {
      settingsSpec['card-created-times'] = { $set: nextCreatedTimes };
    }

    if (didUpdateCompletedTimes) {
      settingsSpec['card-completed-times'] = { $set: nextCompletedTimes };
    }

    if (deletedLaneId !== null) {
      if (defaultCompleteLaneIds) {
        const nextDefaultCompleteLaneIds = { ...defaultCompleteLaneIds };
        let didUpdateDefaultCompleteLaneIds = false;

        if (Object.prototype.hasOwnProperty.call(nextDefaultCompleteLaneIds, deletedLaneId)) {
          delete nextDefaultCompleteLaneIds[deletedLaneId];
          didUpdateDefaultCompleteLaneIds = true;
        }

        Object.entries(nextDefaultCompleteLaneIds).forEach(([sourceLaneId, targetLaneId]) => {
          if (targetLaneId === deletedLaneId) {
            delete nextDefaultCompleteLaneIds[sourceLaneId];
            didUpdateDefaultCompleteLaneIds = true;
          }
        });

        if (didUpdateDefaultCompleteLaneIds) {
          if (Object.keys(nextDefaultCompleteLaneIds).length) {
            settingsSpec['default-complete-lane-ids'] = {
              $set: nextDefaultCompleteLaneIds,
            };
          } else {
            unsetSettings.push('default-complete-lane-ids');
          }
        }
      }

      if (defaultCompleteLaneId === deletedLaneId) {
        unsetSettings.push('default-complete-lane-id');
      }

      unsetSettings.push('default-complete-lane-title', 'default-complete-lane-titles');
    }

    if (laneBackgroundColors?.[entity.id]) {
      const nextLaneBackgroundColors = { ...laneBackgroundColors };
      delete nextLaneBackgroundColors[entity.id];
      settingsSpec['lane-background-colors'] = { $set: nextLaneBackgroundColors };
    }

    if (unsetSettings.length) {
      settingsSpec.$unset = unsetSettings;
    }

    return applySettingsSpec(boardData, settingsSpec);
  };

  return {
    appendItems: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          appendEntities(boardData, path, created.items),
          created.settingsSpec
        );
      });
    },

    prependItems: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          prependEntities(boardData, path, created.items),
          created.settingsSpec
        );
      });
    },

    insertItems: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          insertEntity(boardData, path, created.items),
          created.settingsSpec
        );
      });
    },

    replaceItem: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          insertEntity(removeEntity(boardData, path), path, created.items),
          created.settingsSpec
        );
      });
    },

    splitItem: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          insertEntity(removeEntity(boardData, path), path, created.items),
          created.settingsSpec
        );
      });
    },

    moveItemToTop: (path: Path) => {
      stateManager.setState((boardData) => moveEntity(boardData, path, [path[0], 0]));
    },

    moveItemToBottom: (path: Path) => {
      stateManager.setState((boardData) => {
        const laneIndex = path[0];
        const lane = boardData.children[laneIndex];
        return moveEntity(boardData, path, [laneIndex, lane.children.length]);
      });
    },

    addLane: (lane: Lane) => {
      stateManager.setState((boardData) => {
        const collapseState = view.getViewState('list-collapse') || [];
        const op = (collapseState: boolean[]) => {
          const newState = [...collapseState];
          newState.push(false);
          return newState;
        };

        view.setViewState('list-collapse', undefined, op);
        return update<Board>(appendEntities(boardData, [], [lane]), {
          data: { settings: { 'list-collapse': { $set: op(collapseState) } } },
        });
      });
    },

    insertLane: (path: Path, lane: Lane) => {
      stateManager.setState((boardData) => {
        const collapseState = view.getViewState('list-collapse');
        const op = (collapseState: boolean[]) => {
          const newState = [...collapseState];
          newState.splice(path.last(), 0, false);
          return newState;
        };

        view.setViewState('list-collapse', undefined, op);

        return update<Board>(insertEntity(boardData, path, [lane]), {
          data: { settings: { 'list-collapse': { $set: op(collapseState) } } },
        });
      });
    },

    updateLane: (path: Path, lane: Lane) => {
      stateManager.setState((boardData) =>
        updateParentEntity(boardData, path, {
          children: {
            [path[path.length - 1]]: {
              $set: lane,
            },
          },
        })
      );
    },

    archiveLane: (path: Path) => {
      stateManager.setState((boardData) => {
        const lane = getEntityFromPath(boardData, path);
        const items = lane.children;

        try {
          const archived = archiveItemsWithSources(
            items,
            lane,
            (itemIndex) => itemIndex
          );
          const collapseState = view.getViewState('list-collapse');
          const op = (collapseState: boolean[]) => {
            const newState = [...collapseState];
            newState.splice(path.last(), 1);
            return newState;
          };
          view.setViewState('list-collapse', undefined, op);

          return updateArchivedSources(
            update<Board>(removeEntity(boardData, path), {
              data: {
                settings: { 'list-collapse': { $set: op(collapseState) } },
                archive: {
                  $unshift: archived.items,
                },
              },
            }),
            archived.sources
          );
        } catch (e) {
          stateManager.setError(e);
          return boardData;
        }
      });
    },

    archiveLaneItems: (path: Path) => {
      stateManager.setState((boardData) => {
        const lane = getEntityFromPath(boardData, path);
        const items = lane.children;

        try {
          const archived = archiveItemsWithSources(
            items,
            lane,
            (itemIndex) => itemIndex
          );

          return updateArchivedSources(
            update(
              updateEntity(boardData, path, {
                children: {
                  $set: [],
                },
              }),
              {
                data: {
                  archive: {
                    $unshift: archived.items,
                  },
                },
              }
            ),
            archived.sources
          );
        } catch (e) {
          stateManager.setError(e);
          return boardData;
        }
      });
    },

    deleteEntity: (path: Path) => {
      stateManager.setState((boardData) => {
        const entity = getEntityFromPath(boardData, path);
        const nextBoard = clearDeletedEntityReferences(removeEntity(boardData, path), entity, path);

        if (entity.type === DataTypes.Lane) {
          const collapseState = view.getViewState('list-collapse');
          const op = (collapseState: boolean[]) => {
            const newState = [...collapseState];
            newState.splice(path.last(), 1);
            return newState;
          };
          view.setViewState('list-collapse', undefined, op);

          return update<Board>(nextBoard, {
            data: { settings: { 'list-collapse': { $set: op(collapseState) } } },
          });
        }

        return nextBoard;
      });
    },

    updateItem: (path: Path, item: Item) => {
      stateManager.setState((boardData) => {
        const previousItem = getEntityFromPath(boardData, path) as Item;
        const itemWithBlockId =
          previousItem.data.blockId && !item.data.blockId
            ? update<Item>(item, { data: { blockId: { $set: previousItem.data.blockId } } })
            : item;
        const created = addCreatedTimes(boardData, [itemWithBlockId]);
        const nextBoard = updateParentEntity(boardData, path, {
          children: {
            [path[path.length - 1]]: {
              $set: created.items[0],
            },
          },
        });

        return applySettingsSpec(
          nextBoard,
          {
            ...created.settingsSpec,
            ...updateCompletedTimes(nextBoard, created.items),
          }
        );
      });
    },

    archiveItem: (path: Path) => {
      stateManager.setState((boardData) => {
        const item = getEntityFromPath(boardData, path);
        try {
          const lane = boardData.children[path[0]];
          const archived = archiveItemsWithSources([item], lane, path[0], () => path[1]);
          let nextBoard = removeEntity(boardData, path);
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

          nextBoard = updateArchivedSources(nextBoard, archived.sources);

          return update(nextBoard, {
            data: {
              archive: {
                $push: archived.items,
              },
            },
          });
        } catch (e) {
          stateManager.setError(e);
          return boardData;
        }
      });
    },

    unarchiveItem: (archiveIndex: number) => {
      stateManager.setState((boardData) => {
        const item = boardData.data.archive[archiveIndex];

        if (!item) {
          return boardData;
        }

        const blockId = item.data.blockId;
        const source = blockId ? boardData.data.settings['archived-card-sources']?.[blockId] : null;

        if (!blockId || !source) {
          new Notice(t('Unable to find source list'));
          return boardData;
        }

        const sourceLaneIndex = findArchivedSourceLaneIndex(boardData, source);

        if (sourceLaneIndex < 0 || !boardData.children[sourceLaneIndex]) {
          new Notice(t('Unable to find source list'));
          return boardData;
        }

        const unarchivedItem = removeArchiveDate(item, source);
        const sourceLane = boardData.children[sourceLaneIndex];
        const destinationIndex = Math.min(
          source.sourceItemIndex ?? sourceLane.children.length,
          sourceLane.children.length
        );
        const nextSources = { ...(boardData.data.settings['archived-card-sources'] || {}) };
        delete nextSources[blockId];

        return update(
          insertEntity(
            update<Board>(boardData, {
              data: {
                archive: {
                  $splice: [[archiveIndex, 1]],
                },
              },
            }),
            [sourceLaneIndex, destinationIndex],
            [unarchivedItem]
          ),
          {
            data: {
              settings: {
                'archived-card-sources': {
                  $set: nextSources,
                },
              },
            },
          }
        );
      });
    },

    duplicateEntity: (path: Path) => {
      stateManager.setState((boardData) => {
        const entity = getEntityFromPath(boardData, path);
        let entityWithNewID = update(entity, {
          id: { $set: generateInstanceId() },
        });

        if (entity.type === DataTypes.Item) {
          entityWithNewID = update(entityWithNewID, {
            data: {
              $unset: ['blockId'],
            },
          });
        }

        if (entity.type === DataTypes.Lane) {
          const collapseState = view.getViewState('list-collapse');
          const op = (collapseState: boolean[]) => {
            const newState = [...collapseState];
            newState.splice(path.last(), 0, collapseState[path.last()]);
            return newState;
          };
          view.setViewState('list-collapse', undefined, op);

          return update<Board>(insertEntity(boardData, path, [entityWithNewID]), {
            data: { settings: { 'list-collapse': { $set: op(collapseState) } } },
          });
        }

        const created = addCreatedTimes(boardData, [entityWithNewID as Item]);

        return applySettingsSpec(
          insertEntity(boardData, path, created.items),
          created.settingsSpec
        );
      });
    },
  };
}
