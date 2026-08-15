 

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
import {
  getArchivedCardSource,
  getCardCreatedTime,
  getCardCompletedTime,
  getCompletedCardSource,
  PersistedArchivedCard,
  sanitizeCards,
  updateCard,
  removeCards,
} from 'src/helpers/cardSettings';

import { escapeRegExpStr, generateInstanceId } from '../components/helpers';
import { Board, DataTypes, Item, Lane } from '../components/types';

function asLane(entity: Board | Lane | Item): Lane | null {
  return entity.type === DataTypes.Lane ? entity : null;
}

function asItem(entity: Board | Lane | Item): Item | null {
  return entity.type === DataTypes.Item ? entity : null;
}

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

type SettingsSpec = Record<string, unknown>;

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

  const removeArchiveDate = (item: Item, source: PersistedArchivedCard) => {
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
    const item = asItem(entity);

    if (item) {
      const blockId = item.data.blockId;
      return typeof blockId === 'string' && blockId.length > 0 ? [blockId] : [];
    }

    const nextIds: string[] = [];
    for (const child of entity.children as Item[]) {
      nextIds.push(...collectBlockIds(child));
    }
    return nextIds;
  };

  const applySettingsSpec = (boardData: Board, settingsSpec: SettingsSpec) => {
    if (!Object.keys(settingsSpec).length) {
      return boardData;
    }

    const nextBoard = update<Board>(boardData, { data: { settings: settingsSpec as never } });
    return nextBoard;
  };

  const addCreatedTimes = (boardData: Board, items: Item[]) => {
    const createdAt = Date.now();
    let nextCards = sanitizeCards(boardData.data.settings.cards) || [];
    let didUpdateCards = false;

    const nextItems = items.map((item) => {
      const blockId = item.data.blockId || generateInstanceId(6);
      const itemWithBlockId = item.data.blockId
        ? item
        : update<Item>(item, { data: { blockId: { $set: blockId } } });

      if (!getCardCreatedTime({ ...boardData.data.settings, cards: nextCards }, blockId)) {
        nextCards = updateCard({ ...boardData.data.settings, cards: nextCards }, blockId, (card) => ({
          ...card,
          'created-time': createdAt,
        }));
        didUpdateCards = true;
      }

      return itemWithBlockId;
    });

    return {
      items: nextItems,
      settingsSpec: didUpdateCards ? { cards: { $set: nextCards } } : {},
    };
  };

  const updateCompletedTimes = (boardData: Board, items: Item[]) => {
    let nextCards = sanitizeCards(boardData.data.settings.cards) || [];
    let didUpdateCards = false;

    items.forEach((item) => {
      const blockId = item.data.blockId;

      if (!blockId) {
        return;
      }

      const isComplete = item.data.checked && item.data.checkChar === getTaskStatusDone();

      if (isComplete && !getCardCompletedTime({ ...boardData.data.settings, cards: nextCards }, blockId)) {
        nextCards = updateCard({ ...boardData.data.settings, cards: nextCards }, blockId, (card) => ({
          ...card,
          'completed-time': Date.now(),
        }));
        didUpdateCards = true;
      } else if (!isComplete && getCardCompletedTime({ ...boardData.data.settings, cards: nextCards }, blockId)) {
        nextCards = updateCard({ ...boardData.data.settings, cards: nextCards }, blockId, (card) => {
          const nextCard = { ...card };
          delete nextCard['completed-time'];
          delete nextCard.sourceLaneId;
          delete nextCard.sourceItemIndex;
          delete nextCard.targetLaneId;
          return nextCard;
        });
        didUpdateCards = true;
      }
    });

    return didUpdateCards ? { cards: { $set: nextCards } } : {};
  };

  const archiveItemsWithSources = (
    items: Item[],
    sourceLane: Lane,
    getSourceItemIndex: (itemIndex: number) => number
  ) => {
    const archivedAt = Date.now();
    const archiveDateSettings = getArchiveDateSettings();
    let nextCards = sanitizeCards(stateManager.state.data.settings.cards) || [];
    const archivedItems = items.map((item, itemIndex) => {
      const blockId = item.data.blockId || generateInstanceId(6);
      const itemWithBlockId = item.data.blockId
        ? item
        : update<Item>(item, { data: { blockId: { $set: blockId } } });

      nextCards = updateCard(
        { ...stateManager.state.data.settings, cards: nextCards },
        blockId,
        (card) => ({
          ...card,
          archived: {
            sourceLaneId: sourceLane.id,
            sourceItemIndex: getSourceItemIndex(itemIndex),
            archivedAt,
            ...archiveDateSettings,
          },
        })
      );

      return stateManager.getSetting('archive-with-date')
        ? appendArchiveDate(itemWithBlockId, archivedAt)
        : itemWithBlockId;
    });

    return { items: archivedItems, cards: nextCards };
  };

  const updateCards = (boardData: Board, cards: KanbanSettings['cards']) => {
    if (!cards) {
      return boardData;
    }

    return update<Board>(boardData, {
      data: {
        settings: {
          cards: {
            $set: cards,
          },
        },
      },
    });
  };

  const findArchivedSourceLaneIndex = (boardData: Board, source: PersistedArchivedCard) => {
    return boardData.children.findIndex((lane) => lane.id === source.sourceLaneId);
  };

  const clearDeletedEntityReferences = (boardData: Board, entity: Item | Lane, path: Path) => {
    const blockIds = collectBlockIds(entity);
    const cards = sanitizeCards(boardData.data.settings.cards);
    const defaultCompleteLaneIds = boardData.data.settings['default-complete-lane-ids'];
    const defaultCompleteLaneId = boardData.data.settings['default-complete-lane-id'];

    if (
      !cards &&
      !defaultCompleteLaneIds &&
      !defaultCompleteLaneId &&
      entity.type !== DataTypes.Lane
    ) {
      return boardData;
    }

    const deletedLaneId = entity.type === DataTypes.Lane ? entity.id : null;
    let nextCards = cards ? removeCards(boardData.data.settings, blockIds) : cards;
    let didUpdateCards = !!cards && nextCards !== cards;

    if (entity.type === DataTypes.Lane && nextCards) {
      const filteredCards = nextCards
        .map((card) => {
          if (card.sourceLaneId !== deletedLaneId && card.archived?.sourceLaneId !== deletedLaneId) {
            return card;
          }

          const nextCard = { ...card };

          if (nextCard.sourceLaneId === deletedLaneId) {
            delete nextCard.sourceLaneId;
            delete nextCard.sourceItemIndex;
            delete nextCard.targetLaneId;
          }

          if (nextCard.archived?.sourceLaneId === deletedLaneId) {
            delete nextCard.archived;
          }

          return nextCard;
        })
        .map((card) => updateCard({ cards: [] }, card.id, () => card)[0])
        .filter(Boolean);

      if (filteredCards.length !== nextCards.length || filteredCards.some((card, index) => card !== nextCards[index])) {
        nextCards = filteredCards.length ? filteredCards : undefined;
        didUpdateCards = true;
      }
    }

    if (entity.type !== DataTypes.Lane) {
      const settingsSpec: SettingsSpec = {};

      if (didUpdateCards) {
        settingsSpec.cards = { $set: nextCards };
      }

      return applySettingsSpec(boardData, settingsSpec);
    }

    const laneBackgroundColors = boardData.data.settings['lane-background-colors'];
    const settingsSpec: SettingsSpec = {};
    const unsetSettings: string[] = [];

    if (didUpdateCards) {
      settingsSpec.cards = { $set: nextCards };
    }

    if (deletedLaneId !== null) {
      boardData = update<Board>(boardData, {
        children: {
          $set: boardData.children.map((lane) => {
            if (lane.id === deletedLaneId || lane.data.defaultCompleteLaneId !== deletedLaneId) {
              return lane;
            }

            return update(lane, {
              data: {
                $unset: ['defaultCompleteLaneId'],
              },
            });
          }),
        },
      });

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
          appendEntities(boardData, path, created.items) as Board,
          created.settingsSpec
        );
      });
    },

    prependItems: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          prependEntities(boardData, path, created.items) as Board,
          created.settingsSpec
        );
      });
    },

    insertItems: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          insertEntity(boardData, path, created.items) as Board,
          created.settingsSpec
        );
      });
    },

    replaceItem: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          insertEntity(removeEntity(boardData, path) as Board, path, created.items) as Board,
          created.settingsSpec
        );
      });
    },

    splitItem: (path: Path, items: Item[]) => {
      stateManager.setState((boardData) => {
        const created = addCreatedTimes(boardData, items);

        return applySettingsSpec(
          insertEntity(removeEntity(boardData, path) as Board, path, created.items) as Board,
          created.settingsSpec
        );
      });
    },

    moveItemToTop: (path: Path) => {
      stateManager.setState((boardData) => moveEntity(boardData, path, [path[0], 0]) as Board);
    },

    moveItemToBottom: (path: Path) => {
      stateManager.setState((boardData) => {
        const laneIndex = path[0];
        const lane = boardData.children[laneIndex];
        return moveEntity(boardData, path, [laneIndex, lane.children.length]) as Board;
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
        const appendedBoard = appendEntities(boardData, [], [lane]) as Board;
        return update<Board>(appendedBoard, {
          data: { settings: { 'list-collapse': { $set: op(collapseState) } } },
        });
      });
    },

    insertLane: (path: Path, lane: Lane) => {
      stateManager.setState((boardData) => {
        const collapseState = view.getViewState('list-collapse') || [];
        const op = (collapseState: boolean[]) => {
          const newState = [...collapseState];
          newState.splice(path.last(), 0, false);
          return newState;
        };

        view.setViewState('list-collapse', undefined, op);

        const insertedBoard = insertEntity(boardData, path, [lane]) as Board;
        return update<Board>(insertedBoard, {
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
        const lane = asLane(getEntityFromPath(boardData, path) as Board | Lane | Item);
        if (!lane) return boardData;
        const items = lane.children;

        try {
          const archived = archiveItemsWithSources(items, lane, (itemIndex) => itemIndex);
          const collapseState = view.getViewState('list-collapse') || [];
          const op = (collapseState: boolean[]) => {
            const newState = [...collapseState];
            newState.splice(path.last(), 1);
            return newState;
          };
          view.setViewState('list-collapse', undefined, op);

          const removedBoard = removeEntity(boardData, path) as Board;

          return updateCards(
            update<Board>(removedBoard, {
              data: {
                settings: { 'list-collapse': { $set: op(collapseState) } },
                archive: {
                  $unshift: archived.items,
                },
              },
            }),
            archived.cards
          );
        } catch (e) {
          stateManager.setError(e instanceof Error ? e : new Error(String(e)));
          return boardData;
        }
      });
    },

    archiveLaneItems: (path: Path) => {
      stateManager.setState((boardData) => {
        const lane = asLane(getEntityFromPath(boardData, path) as Board | Lane | Item);
        if (!lane) return boardData;
        const items = lane.children;

        try {
          const archived = archiveItemsWithSources(items, lane, (itemIndex) => itemIndex);

          const updatedBoard = updateEntity(boardData, path, {
            children: {
              $set: [],
            },
          }) as Board;

          return updateCards(
            update(
              updatedBoard,
              {
                data: {
                  archive: {
                    $unshift: archived.items,
                  },
                },
              }
            ),
            archived.cards
          );
        } catch (e) {
          stateManager.setError(e instanceof Error ? e : new Error(String(e)));
          return boardData;
        }
      });
    },

    deleteEntity: (path: Path) => {
      stateManager.setState((boardData) => {
        const entity = getEntityFromPath(boardData, path) as Board | Lane | Item;
        const nextBoard = clearDeletedEntityReferences(removeEntity(boardData, path) as Board, entity, path);

        if (entity.type === DataTypes.Lane) {
          const collapseState = view.getViewState('list-collapse') || [];
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
        const previousItem = asItem(getEntityFromPath(boardData, path) as Board | Lane | Item);
        if (!previousItem) return boardData;
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
        }) as Board;

        return applySettingsSpec(nextBoard, {
          ...created.settingsSpec,
          ...updateCompletedTimes(nextBoard, created.items),
        });
      });
    },

    archiveItem: (path: Path) => {
      stateManager.setState((boardData) => {
        const item = asItem(getEntityFromPath(boardData, path) as Board | Lane | Item);
        if (!item) return boardData;
        try {
          const lane = boardData.children[path[0]];
          const archived = archiveItemsWithSources([item], lane, () => path[1]);
          let nextBoard = removeEntity(boardData, path) as Board;
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

          nextBoard = updateCards(nextBoard, archived.cards);

          const archivedBoard = update<Board>(nextBoard, {
            data: {
              archive: {
                $push: archived.items,
              },
            },
          });

          return archivedBoard;
        } catch (e) {
          stateManager.setError(e instanceof Error ? e : new Error(String(e)));
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
        const source = getArchivedCardSource(boardData.data.settings, blockId);

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
                cards: {
                  $set: updateCard(boardData.data.settings, blockId, (card) => {
                    const nextCard = { ...card };
                    delete nextCard.archived;
                    return nextCard;
                  }),
                },
              },
            },
          }
        );
      });
    },

    duplicateEntity: (path: Path) => {
      stateManager.setState((boardData) => {
        const entity = getEntityFromPath(boardData, path) as Board | Lane | Item;
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
          const collapseState = view.getViewState('list-collapse') || [];
          const op = (collapseState: boolean[]) => {
            const newState = [...collapseState];
            newState.splice(path.last(), 0, collapseState[path.last()]);
            return newState;
          };
          view.setViewState('list-collapse', undefined, op);

          const insertedBoard = insertEntity(boardData, path, [entityWithNewID]) as Board;
          return update<Board>(insertedBoard, {
            data: { settings: { 'list-collapse': { $set: op(collapseState) } } },
          });
        }

        const created = addCreatedTimes(boardData, [entityWithNewID as Item]);

        return applySettingsSpec(
          insertEntity(boardData, path, created.items) as Board,
          created.settingsSpec
        );
      });
    },
  };
}
