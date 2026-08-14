import classcat from 'classcat';
import update from 'immutability-helper';
import { JSX, createPortal, memo, useCallback, useMemo } from 'preact/compat';

import { KanbanView } from './KanbanView';
import { DraggableItem } from './components/Item/Item';
import { DraggableLane } from './components/Lane/Lane';
import { KanbanContext, KanbanContextProps } from './components/context';
import { c, maybeCompleteForMove } from './components/helpers';
import { Board, DataTypes, Item, Lane, manualSortRule } from './components/types';
import { DndContext } from './dnd/components/DndContext';
import { DragOverlay } from './dnd/components/DragOverlay';
import { Entity, Nestable } from './dnd/types';
import {
  getEntityFromPath,
  insertEntity,
  moveEntity,
  removeEntity,
  updateEntity,
} from './dnd/util/data';
import { getCompletedCardSource, updateCard } from './helpers/cardSettings';
import { getBoardModifiers } from './helpers/boardModifiers';
import KanbanPlugin from './main';
import { frontmatterKey } from './parsers/common';
import {
  getTaskStatusDone,
  getTaskStatusPreDone,
  toggleTask,
} from './parsers/helpers/inlineMetadata';

interface HtmlDndEntityData {
  viewId: string;
  content: string[];
  win: Window;
}

interface BoardEntityData {
  type: string;
  acceptsSort?: string[];
  win: Window;
}

type BoardEntity = Board | Lane | Item;
type OverlayData = [BoardEntity | null, KanbanContextProps | null];

function isItemEntity(entity: BoardEntity): entity is Item {
  return entity.type === DataTypes.Item;
}

function isLaneEntity(entity: BoardEntity | Board): entity is Lane {
  return entity.type === DataTypes.Lane;
}

function updateCompletedSource(
  board: Board,
  item: Item,
  sourceLaneId: string,
  sourceItemIndex: number,
  targetLaneId: string
) {
  const blockId = item.data.blockId;

  if (!blockId) {
    return board;
  }

  return update<Board>(board, {
    data: {
      settings: {
        cards: {
          $set: updateCard(board.data.settings, blockId, (card) => ({
            ...card,
            sourceLaneId,
            sourceItemIndex,
            targetLaneId,
          })),
        },
      },
    },
  });
}

function updateCompletedTime(board: Board, item: Item) {
  const blockId = item.data.blockId;

  if (!blockId) {
    return board;
  }

  const isComplete = item.data.checked && item.data.checkChar === getTaskStatusDone();

  if (isComplete && !board.data.settings.cards?.find((card) => card.id === blockId)?.['completed-time']) {
    return update<Board>(board, {
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
  } else if (isComplete) {
    return board;
  } else if (getCompletedCardSource(board.data.settings, blockId) || board.data.settings.cards?.find((card) => card.id === blockId)?.['completed-time']) {
    return update<Board>(board, {
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
  } else {
    return board;
  }
}

export function createApp(win: Window, plugin: KanbanPlugin) {
  return <DragDropApp win={win} plugin={plugin} />;
}

const View = memo(function View({ view }: { view: KanbanView }) {
  return createPortal(view.getPortal(), view.contentEl);
});

export function DragDropApp({ win, plugin }: { win: Window; plugin: KanbanPlugin }) {
  const views = plugin.useKanbanViews(win);
  const portals: JSX.Element[] = views.map((view) => <View key={view.id} view={view} />);

  const handleDrop = useCallback(
    (dragEntity: Entity, dropEntity: Entity) => {
      if (!dragEntity || !dropEntity) {
        return;
      }

      if (dragEntity.scopeId === 'htmldnd') {
        const data = dragEntity.getData() as unknown as HtmlDndEntityData;
        const stateManager = plugin.getStateManagerFromViewID(data.viewId, data.win);

        if (!stateManager) {
          return;
        }

        const dropPath = dropEntity.getPath();
        const destinationParent = getEntityFromPath(
          stateManager.state,
          dropPath.slice(0, -1)
        ) as Board | Lane;
        const destinationLane = isLaneEntity(destinationParent) ? destinationParent : null;

        try {
          const items: Item[] = data.content.map((title: string) => {
            let item = stateManager.getNewItem(title, ' ');
            const isComplete = !!destinationLane?.data.shouldMarkItemsComplete;

            if (isComplete) {
              item = update(item, { data: { checkChar: { $set: getTaskStatusPreDone() } } });
              const updates = toggleTask(item, stateManager.file);
              if (updates) {
                const [itemStrings, checkChars, thisIndex] = updates;
                const nextItem = itemStrings[thisIndex];
                const checkChar = checkChars[thisIndex];
                return stateManager.getNewItem(nextItem, checkChar);
              }
            }

            return update(item, {
              data: {
                checked: {
                  $set: isComplete,
                },
                checkChar: {
                  $set: isComplete ? getTaskStatusDone() : ' ',
                },
              },
            });
          });

          return stateManager.setState((board) => insertEntity(board, dropPath, items));
        } catch (e) {
          stateManager.setError(e instanceof Error ? e : new Error(String(e)));
          console.error(e);
        }

        return;
      }

      const dragPath = dragEntity.getPath();
      const dropPath = dropEntity.getPath();
    const dragEntityData = dragEntity.getData() as BoardEntityData;
    const dropEntityData = dropEntity.getData() as BoardEntityData;
      const [, sourceFile] = dragEntity.scopeId.split(':::');
      const [, destinationFile] = dropEntity.scopeId.split(':::');

      const inDropArea =
        dropEntityData.acceptsSort && !dropEntityData.acceptsSort.includes(dragEntityData.type);

      // Same board
      if (sourceFile === destinationFile) {
        const view = plugin.getKanbanView(dragEntity.scopeId, dragEntityData.win);

        if (!view) {
          return;
        }

        const stateManager = plugin.stateManagers.get(view.file);

        if (!stateManager) {
          return;
        }

        if (inDropArea) {
          dropPath.push(0);
        }

        return stateManager.setState((board) => {
          const entity = getEntityFromPath(board, dragPath) as Item | Lane;
          const sourceParent = getEntityFromPath(board, dragPath.slice(0, -1)) as Board | Lane;
          const destinationParentBeforeMove = getEntityFromPath(
            board,
            dropPath.slice(0, -1)
          ) as Board | Lane;
          const sourceLane = isLaneEntity(sourceParent) ? sourceParent : null;
          const destinationLaneBeforeMove =
            isLaneEntity(destinationParentBeforeMove) ? destinationParentBeforeMove : null;
          const didEnterCompleteLane =
            isItemEntity(entity) &&
            dragPath[0] !== dropPath[0] &&
            !!destinationLaneBeforeMove?.data.shouldMarkItemsComplete;
          const didLeaveCompleteLane =
            isItemEntity(entity) &&
            !!sourceLane?.data.shouldMarkItemsComplete &&
            !destinationLaneBeforeMove?.data.shouldMarkItemsComplete;
          let newBoard = moveEntity(
            board,
            dragPath,
            dropPath,
            (current) => {
              const entity = current as BoardEntity;

              if (isItemEntity(entity)) {
                const { next } = maybeCompleteForMove(
                  stateManager,
                  board,
                  dragPath,
                  stateManager,
                  board,
                  dropPath,
                  entity
                );

                return next;
              }
              return entity;
            },
            (current) => {
              const entity = current as BoardEntity;

              if (isItemEntity(entity)) {
                const { replacement } = maybeCompleteForMove(
                  stateManager,
                  board,
                  dragPath,
                  stateManager,
                  board,
                  dropPath,
                  entity
                );
                return replacement;
              }
            }
          ) as Board;

          if (isLaneEntity(entity)) {
            const from = dragPath.last();
            let to = dropPath.last();

            if (from === undefined || to === undefined) {
              return newBoard;
            }

            if (from < to) to -= 1;

            const collapsedState = (view.getViewState('list-collapse')) || [];
            const op = (collapsedState?: boolean[]) => {
              const currentState = collapsedState || [];
              const newState = [...currentState];
              newState.splice(to, 0, newState.splice(from, 1)[0]);
              return newState;
            };

            view.setViewState('list-collapse', undefined, op);

            return update<Board>(newBoard, {
              data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
            });
          }

          if (isItemEntity(entity)) {
            const movedItem = getEntityFromPath(newBoard, dropPath) as Item;
            const blockId = movedItem?.data.blockId;

            if (didLeaveCompleteLane && blockId && getCompletedCardSource(newBoard.data.settings, blockId)) {
              newBoard = update<Board>(newBoard, {
                data: {
                  settings: {
                    cards: {
                      $set: updateCard(newBoard.data.settings, blockId, (card) => {
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

            newBoard = updateCompletedTime(newBoard, movedItem);

            if (
              didEnterCompleteLane &&
              sourceLane &&
              destinationLaneBeforeMove
            ) {
              newBoard = updateCompletedSource(
                newBoard,
                movedItem,
                sourceLane.id,
                dragPath[1],
                destinationLaneBeforeMove.id
              );
            }
          }

          // Manual drag ordering overrides previous sorted order in the destination lane
          const destinationParentPath = dropPath.slice(0, -1);
          const destinationParent = getEntityFromPath(newBoard, destinationParentPath) as
            | Board
            | Lane;

          if (isItemEntity(entity) && isLaneEntity(destinationParent)) {
            return updateEntity(newBoard, destinationParentPath, {
              data: {
                sortRule: {
                  $set: manualSortRule,
                },
                $unset: ['sorted'],
              },
            });
          }

          return newBoard;
        });
      }

      const sourceView = plugin.getKanbanView(dragEntity.scopeId, dragEntityData.win);

      if (!sourceView) {
        return;
      }

      const sourceStateManager = plugin.stateManagers.get(sourceView.file);

      if (!sourceStateManager) {
        return;
      }

      const destinationView = plugin.getKanbanView(dropEntity.scopeId, dropEntityData.win);

      if (!destinationView) {
        return;
      }

      const destinationStateManager = plugin.stateManagers.get(destinationView.file);

      if (!destinationStateManager) {
        return;
      }

      sourceStateManager.setState((sourceBoard) => {
        const entity = getEntityFromPath(sourceBoard, dragPath) as Item | Lane;
        const sourceParent = getEntityFromPath(sourceBoard, dragPath.slice(0, -1)) as Board | Lane;
        const destinationParent = getEntityFromPath(
          destinationStateManager.state,
          dropPath.slice(0, -1)
        ) as Board | Lane;
        const sourceLane = isLaneEntity(sourceParent) ? sourceParent : null;
        const destinationLane = isLaneEntity(destinationParent) ? destinationParent : null;
        const didEnterCompleteLane =
          isItemEntity(entity) &&
          !!destinationLane?.data.shouldMarkItemsComplete;
        const didLeaveCompleteLane =
          isItemEntity(entity) &&
          !!sourceLane?.data.shouldMarkItemsComplete &&
          !destinationLane?.data.shouldMarkItemsComplete;
        let replacementEntity: Nestable | undefined;

        destinationStateManager.setState((destinationBoard) => {
          if (inDropArea) {
            const parent = getEntityFromPath(destinationStateManager.state, dropPath) as Board | Lane;
            const shouldAppend =
              (destinationStateManager.getSetting('new-card-insertion-method') || 'append') ===
              'append';

            if (shouldAppend) dropPath.push(parent.children.length);
            else dropPath.push(0);
          }

          const toInsert: Nestable[] = [];

          if (isItemEntity(entity)) {
            const { next, replacement } = maybeCompleteForMove(
              sourceStateManager,
              sourceBoard,
              dragPath,
              destinationStateManager,
              destinationBoard,
              dropPath,
              entity
            );
            replacementEntity = replacement;
            toInsert.push(next);
          } else {
            toInsert.push(entity);
          }

          if (isItemEntity(entity)) {
            let nextDestinationBoard = insertEntity(destinationBoard, dropPath, toInsert) as Board;
            const insertedItem = toInsert[0] as Item;
            nextDestinationBoard = updateCompletedTime(nextDestinationBoard, insertedItem);

            if (
              didEnterCompleteLane &&
              sourceLane &&
              destinationLane
            ) {
              nextDestinationBoard = updateCompletedSource(
                nextDestinationBoard,
                insertedItem,
                sourceLane.id,
                dragPath[1],
                destinationLane.id
              );
            }

            return nextDestinationBoard;
          }

          if (isLaneEntity(entity)) {
            const collapsedState =
              (destinationView.getViewState('list-collapse')) || [];
            const sourceCollapsedState =
              (sourceView.getViewState('list-collapse')) || [];
            const from = dragPath.last();
            const to = dropPath.last();

            if (from === undefined || to === undefined) {
              return destinationBoard;
            }

            const val = sourceCollapsedState[from];
            const op = (collapsedState?: boolean[]) => {
              const currentState = collapsedState || [];
              const newState = [...currentState];
              newState.splice(to, 0, val);
              return newState;
            };

            destinationView.setViewState('list-collapse', undefined, op);

            return update<Board>(insertEntity(destinationBoard, dropPath, toInsert) as Board, {
              data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
            });
          }

          return destinationBoard;
        });

        if (isLaneEntity(entity)) {
          const collapsedState =
            (sourceView.getViewState('list-collapse')) || [];
          const from = dragPath.last();

          if (from === undefined) {
            return sourceBoard;
          }

          const op = (collapsedState?: boolean[]) => {
            const currentState = collapsedState || [];
            const newState = [...currentState];
            newState.splice(from, 1);
            return newState;
          };
          sourceView.setViewState('list-collapse', undefined, op);

          return update<Board>(removeEntity(sourceBoard, dragPath) as Board, {
            data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
          });
        } else {
          let nextSourceBoard = removeEntity(sourceBoard, dragPath, replacementEntity) as Board;
          const blockId = entity.data.blockId;

          if (didLeaveCompleteLane && blockId && getCompletedCardSource(nextSourceBoard.data.settings, blockId)) {
            nextSourceBoard = update<Board>(nextSourceBoard, {
              data: {
                settings: {
                  cards: {
                    $set: updateCard(nextSourceBoard.data.settings, blockId, (card) => {
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

          return nextSourceBoard;
        }
      });
    },
    [views]
  );

  if (portals.length)
    return (
      <DndContext win={win} onDrop={handleDrop}>
        {...portals}
        <DragOverlay>
          {(entity, styles) => {
            const [data, context] = useMemo<OverlayData>(() => {
              if (entity.scopeId === 'htmldnd') {
                return [null, null];
              }

              const overlayData = entity.getData() as BoardEntityData;

              const view = plugin.getKanbanView(entity.scopeId, overlayData.win);
              if (!view) {
                return [null, null];
              }

              const stateManager = plugin.stateManagers.get(view.file);
              if (!stateManager) {
                return [null, null];
              }

              const data = getEntityFromPath(stateManager.state, entity.getPath()) as BoardEntity;
              const boardModifiers = getBoardModifiers(view, stateManager);
              const filePath = view.file.path;

              return [
                data,
                {
                  view,
                  stateManager,
                  boardModifiers,
                  filePath,
                },
              ];
            }, [entity]);

            if (data && context && isLaneEntity(data)) {
              const boardView =
                context.view.viewSettings[frontmatterKey] || context.stateManager.getSetting(frontmatterKey);
              const collapseState =
                (context.view.viewSettings['list-collapse'] ||
                  context.stateManager.getSetting('list-collapse') || []);
              const laneIndex = entity.getPath().last();

              return (
                <KanbanContext.Provider value={context}>
                  <div
                    className={classcat([
                      c('drag-container'),
                      {
                        [c('horizontal')]: boardView !== 'list',
                        [c('vertical')]: boardView === 'list',
                      },
                    ])}
                    style={styles}
                  >
                    <DraggableLane
                      lane={data}
                      laneIndex={laneIndex}
                      isStatic={true}
                      isCollapsed={!!collapseState[laneIndex]}
                      collapseDir={boardView === 'list' ? 'vertical' : 'horizontal'}
                    />
                  </div>
                </KanbanContext.Provider>
              );
            }

            if (data && context && isItemEntity(data)) {
              return (
                <KanbanContext.Provider value={context}>
                  <div className={c('drag-container')} style={styles}>
                    <DraggableItem item={data} itemIndex={0} isStatic={true} />
                  </div>
                </KanbanContext.Provider>
              );
            }

            return <div />;
          }}
        </DragOverlay>
      </DndContext>
    );

  return null;
}
