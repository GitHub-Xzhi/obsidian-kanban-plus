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

import { generateInstanceId } from '../components/helpers';
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

export function getBoardModifiers(view: KanbanView, stateManager: StateManager): BoardModifiers {
  const appendArchiveDate = (item: Item) => {
    const archiveDateFormat = stateManager.getSetting('archive-date-format');
    const archiveDateSeparator = stateManager.getSetting('archive-date-separator');
    const archiveDateAfterTitle = stateManager.getSetting('append-archive-date');

    const newTitle = [moment().format(archiveDateFormat)];

    if (archiveDateSeparator) newTitle.push(archiveDateSeparator);

    newTitle.push(item.data.titleRaw);

    if (archiveDateAfterTitle) newTitle.reverse();

    const titleRaw = newTitle.join(' ');
    return stateManager.updateItemContent(item, titleRaw);
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

  const archiveItemsWithSources = (
    items: Item[],
    sourceLane: Lane,
    sourceLaneIndex: number,
    getSourceItemIndex: (itemIndex: number) => number
  ) => {
    const archivedAt = Date.now();
    const sources: ArchivedCardSources = {};
    const archivedItems = items.map((item, itemIndex) => {
      const blockId = item.data.blockId || generateInstanceId(6);
      const itemWithBlockId = item.data.blockId
        ? item
        : update<Item>(item, { data: { blockId: { $set: blockId } } });

      sources[blockId] = {
        sourceLaneId: sourceLane.id,
        sourceLaneIndex,
        sourceLaneTitle: sourceLane.data.title,
        sourceItemIndex: getSourceItemIndex(itemIndex),
        archivedAt,
      };

      return stateManager.getSetting('archive-with-date')
        ? appendArchiveDate(itemWithBlockId)
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
    if (source.sourceLaneId) {
      return boardData.children.findIndex((lane) => lane.id === source.sourceLaneId);
    }

    return boardData.children.findIndex((lane, laneIndex) => {
      return lane.data.title === source.sourceLaneTitle || laneIndex === source.sourceLaneIndex;
    });
  };

  const clearDeletedEntityReferences = (boardData: Board, entity: Item | Lane, path: Path) => {
    const blockIds = collectBlockIds(entity);
    const sources = boardData.data.settings['completed-card-sources'];
    const archiveSources = boardData.data.settings['archived-card-sources'];
    const createdTimes = boardData.data.settings['card-created-times'];

    if (!sources && !archiveSources && !createdTimes && entity.type !== DataTypes.Lane) {
      return boardData;
    }

    const deletedLaneIndex = entity.type === DataTypes.Lane ? path.last() : null;
    const deletedLaneId = entity.type === DataTypes.Lane ? entity.id : null;
    const nextSources = sources ? { ...sources } : undefined;
    const nextArchiveSources = archiveSources ? { ...archiveSources } : undefined;
    const nextCreatedTimes = createdTimes ? { ...createdTimes } : undefined;
    let didUpdateSources = false;
    let didUpdateArchiveSources = false;
    let didUpdateCreatedTimes = false;

    if (nextSources) {
      for (const blockId of blockIds) {
        if (nextSources[blockId]) {
          delete nextSources[blockId];
          didUpdateSources = true;
        }
      }

      if (entity.type === DataTypes.Lane) {
        Object.entries(nextSources).forEach(([blockId, source]) => {
          if (
            source.sourceLaneId === deletedLaneId ||
            source.sourceLaneIndex === deletedLaneIndex
          ) {
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

      return applySettingsSpec(boardData, settingsSpec);
    }

    const laneIds = boardData.data.settings['lane-ids'];
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

    if (laneIds?.length) {
      const nextLaneIds = [...laneIds];
      nextLaneIds.splice(path.last(), 1);
      settingsSpec['lane-ids'] = { $set: nextLaneIds };
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

        return applySettingsSpec(insertEntity(boardData, path, created.items), created.settingsSpec);
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
            path.last(),
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
            path.last(),
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
        return updateParentEntity(boardData, path, {
          children: {
            [path[path.length - 1]]: {
              $set: item,
            },
          },
        });
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
            [item]
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

        return applySettingsSpec(insertEntity(boardData, path, created.items), created.settingsSpec);
      });
    },
  };
}
