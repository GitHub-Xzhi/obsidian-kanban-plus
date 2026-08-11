import update from 'immutability-helper';
import { Menu, Platform, setTooltip } from 'obsidian';
import { Dispatch, StateUpdater, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { Path } from 'src/dnd/types';
import { getCardCreatedTime, getCardCompletedTime } from 'src/helpers/cardSettings';
import { defaultSort } from 'src/helpers/util';
import { t } from 'src/lang/helpers';
import { lableToName } from 'src/parsers/helpers/inlineMetadata';

import { anyToString } from '../Item/MetadataTable';
import { KanbanContext } from '../context';
import { c, generateInstanceId } from '../helpers';
import { EditState, Lane, LaneSort, LaneTemplate, manualSortRule } from '../types';

export type LaneAction = 'delete' | 'archive' | 'archive-items' | null;

type SortOrder = 'asc' | 'desc';

function getSortTitle(label: string, order: SortOrder) {
  const orderLabel = order === 'asc' ? t('Ascending') : t('Descending');

  return `${t('Sort option prefix')}${label} ${orderLabel}`;
}

function getIncompleteLaneSortTitle(label: string) {
  return `${t('Sort by prefix')}${label}${t('Sort by suffix')}`;
}

function getSortIcon(lane: Lane) {
  return lane.data.shouldMarkItemsComplete ? undefined : 'arrow-down-up';
}

function setSortIcon(
  item: any,
  currentSort: Lane['data']['sorted'],
  currentOptionSort: LaneSort | string
) {
  if (currentSort === currentOptionSort) {
    item.setIcon('lucide-check');
  }
}

function getLaneSortRule(sorted: LaneSort | string): Lane['data']['sortRule'] {
  const bySort = (type: string, order: 'asc' | 'desc') => ({ type, order });

  switch (sorted) {
    case LaneSort.TitleAsc:
      return bySort('card-text', 'asc');
    case LaneSort.TitleDsc:
      return bySort('card-text', 'desc');
    case LaneSort.DateAsc:
      return bySort('date', 'asc');
    case LaneSort.DateDsc:
      return bySort('date', 'desc');
    case LaneSort.TagsAsc:
      return bySort('tags', 'asc');
    case LaneSort.TagsDsc:
      return bySort('tags', 'desc');
    case LaneSort.CreatedAsc:
      return bySort('created-time', 'asc');
    case LaneSort.CreatedDsc:
      return bySort('created-time', 'desc');
    case LaneSort.CompletedAsc:
      return bySort('completed-time', 'asc');
    case LaneSort.CompletedDsc:
      return bySort('completed-time', 'desc');
  }

  if (sorted.endsWith('-asc')) {
    return bySort(sorted.slice(0, -4), 'asc');
  }

  if (sorted.endsWith('-desc')) {
    return bySort(sorted.slice(0, -5), 'desc');
  }
}

function getActionLabels() {
  return {
    delete: {
      description: t('Are you sure you want to delete this list and all its cards?'),
      confirm: t('Yes, delete list'),
    },
    archive: {
      description: t('Are you sure you want to archive this list and all its cards?'),
      confirm: t('Yes, archive list'),
    },
    'archive-items': {
      description: t('Are you sure you want to archive all cards in this list?'),
      confirm: t('Yes, archive cards'),
    },
  };
}

export interface ConfirmActionProps {
  lane: Lane;
  action: LaneAction;
  cancel: () => void;
  onAction: () => void;
}

export function ConfirmAction({ action, cancel, onAction, lane }: ConfirmActionProps) {
  const actionLabels = getActionLabels();

  useEffect(() => {
    // Immediately execute action if lane is empty
    if (action && lane.children.length === 0) {
      onAction();
    }
  }, [action, lane.children.length]);

  if (!action || (action && lane.children.length === 0)) return null;

  return (
    <div className={c('action-confirm-wrapper')}>
      <div className={c('action-confirm-text')}>{actionLabels[action].description}</div>
      <div>
        <button onClick={onAction} className={c('confirm-action-button')}>
          {actionLabels[action].confirm}
        </button>
        <button onClick={cancel} className={c('cancel-action-button')}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}

export interface UseSettingsMenuParams {
  setEditState: Dispatch<StateUpdater<EditState>>;
  path: Path;
  lane: Lane;
}

export function useSettingsMenu({ setEditState, path, lane }: UseSettingsMenuParams) {
  const { stateManager, boardModifiers } = useContext(KanbanContext);
  const board = stateManager.useState();
  const [confirmAction, setConfirmAction] = useState<LaneAction>(null);
  const showCreatedTime =
    lane.data.showCreatedTime ??
    (lane.data.shouldMarkItemsComplete
      ? stateManager.getSetting('show-card-created-time-in-complete-lane', board.data.settings)
      : stateManager.getSetting('show-card-created-time', board.data.settings));
  const showCompletedTime =
    lane.data.showCompletedTime ??
    stateManager.getSetting('show-card-completed-time-in-complete-lane', board.data.settings);

  const completeLanesKey = board.children
    .map(
      (lane, index) =>
        `${index}:${lane.data.title}:${!!lane.data.shouldMarkItemsComplete}:${lane.data.defaultCompleteLaneId || ''}:${lane.data.showCreatedTime}:${lane.data.showCompletedTime}`
    )
    .join('|');

  const settingsMenu = useMemo(() => {
    const metadataSortOptions = new Set<string>();
    let canSortDate = false;
    let canSortTags = false;
    const completeLanes = stateManager.getCompleteLaneOptions();
    const canSortCreatedTime = lane.children.some(
      (item) => !!getCardCreatedTime(board.data.settings, item.data.blockId)
    );
    const canSortCompletedTime = lane.children.some(
      (item) => !!getCardCompletedTime(board.data.settings, item.data.blockId)
    );

    lane.children.forEach((item) => {
      const taskData = item.data.metadata.inlineMetadata;
      if (taskData) {
        taskData.forEach((m) => {
          if (m.key === 'repeat') return;
          if (!metadataSortOptions.has(m.key)) metadataSortOptions.add(m.key);
        });
      }

      if (!canSortDate && item.data.metadata.date) canSortDate = true;
      if (!canSortTags && item.data.metadata.tags?.length) canSortTags = true;
    });

    const menu = new Menu()
      .addItem((item) => {
        item
          .setIcon('lucide-edit-3')
          .setTitle(t('Edit list'))
          .onClick(() => setEditState({ x: 0, y: 0 }));
      })
      .addItem((item) => {
        item
          .setIcon('lucide-archive')
          .setTitle(t('Archive cards'))
          .onClick(() => setConfirmAction('archive-items'));
      });

    menu.addItem((item) => {
      item
        .setIcon('lucide-clock')
        .setTitle(showCreatedTime ? t('Hide created time') : t('Show created time'))
        .onClick(() => {
          boardModifiers.updateLane(
            path,
            update(lane, {
              data: {
                showCreatedTime: {
                  $set: !showCreatedTime,
                },
              },
            })
          );
        });
    });

    if (lane.data.shouldMarkItemsComplete) {
      menu.addItem((item) => {
        item
          .setIcon('lucide-circle-check')
          .setTitle(showCompletedTime ? t('Hide completed time') : t('Show completed time'))
          .onClick(() => {
            boardModifiers.updateLane(
              path,
              update(lane, {
                data: {
                  showCompletedTime: {
                    $set: !showCompletedTime,
                  },
                },
              })
            );
          });
      });
    }

    if (completeLanes.length > 0) {
      menu.addItem((item) => {
        item.setIcon('lucide-check-check').setTitle(t('Change default complete list'));

        if (lane.data.shouldMarkItemsComplete) {
          item.setDisabled(true);

          const menuItemEl = (item as any).dom as HTMLElement | undefined;
          if (menuItemEl) {
            const tooltip = t('Only incomplete lists can set a default complete list');
            setTooltip(menuItemEl, tooltip);
          }

          return;
        }

        const submenu = (item as any).setSubmenu();
        const defaultLaneIndex = stateManager.getDefaultCompleteLaneIndex(path[0]);

        if (defaultLaneIndex !== null) {
          submenu.addItem((item: any) => {
            item
              .setIcon('lucide-x')
              .setTitle(t('Clear default complete list'))
              .onClick(() => stateManager.clearDefaultCompleteLane(path[0]));
          });

          submenu.addSeparator();
        }

        completeLanes.forEach(({ lane, index }) => {
          submenu.addItem((item: any) => {
            item
              .setIcon('lucide-list-checks')
              .setTitle(lane.data.title || t('Untitled'))
              .setChecked(index === defaultLaneIndex)
              .onClick(() => stateManager.setDefaultCompleteLane(index, path[0]));
          });
        });
      });
    }

    menu
      .addSeparator()
      .addItem((i) => {
        i.setIcon('arrow-left-to-line')
          .setTitle(t('Insert list before'))
          .onClick(() =>
            boardModifiers.insertLane(path, {
              ...LaneTemplate,
              id: generateInstanceId(),
              children: [],
              data: {
                title: '',
                shouldMarkItemsComplete: false,
                forceEditMode: true,
              },
            })
          );
      })
      .addItem((i) => {
        i.setIcon('arrow-right-to-line')
          .setTitle(t('Insert list after'))
          .onClick(() => {
            const newPath = [...path];

            newPath[newPath.length - 1] = newPath[newPath.length - 1] + 1;

            boardModifiers.insertLane(newPath, {
              ...LaneTemplate,
              id: generateInstanceId(),
              children: [],
              data: {
                title: '',
                shouldMarkItemsComplete: false,
                forceEditMode: true,
              },
            });
          });
      })
      .addSeparator()
      .addItem((item) => {
        item
          .setIcon('lucide-archive')
          .setTitle(t('Archive list'))
          .onClick(() => setConfirmAction('archive'));
      })
      .addItem((item) => {
        item
          .setIcon('lucide-trash-2')
          .setTitle(t('Delete list'))
          .onClick(() => setConfirmAction('delete'));
      })
      .addSeparator();

    const addSortOptions = (menu: Menu) => {
      const sortByTime = (
        title: string,
        getTime: (blockId?: string) => number | undefined,
        ascSort: LaneSort,
        dscSort: LaneSort
      ) => {
        menu.addItem((item) => {
          const nextSort = lane.data.sorted === ascSort ? dscSort : ascSort;
          const currentOrder = lane.data.sorted === dscSort ? 'desc' : 'asc';
          const icon = getSortIcon(lane);

          if (icon) {
            item.setIcon(icon);
          } else {
            setSortIcon(item, lane.data.sorted, lane.data.sorted === ascSort ? ascSort : dscSort);
          }
          item
            .setTitle(
              lane.data.shouldMarkItemsComplete
                ? getSortTitle(title, currentOrder)
                : getIncompleteLaneSortTitle(title)
            )
            .onClick(() => {
              const children = lane.children.slice();
              const mod = lane.data.sorted === ascSort ? -1 : 1;

              children.sort((a, b) => {
                const aTime = getTime(a.data.blockId);
                const bTime = getTime(b.data.blockId);

                if (aTime && !bTime) return -1;
                if (bTime && !aTime) return 1;
                if (!aTime && !bTime) return 0;

                return (aTime - bTime) * mod;
              });

              boardModifiers.updateLane(
                path,
                update(lane, {
                  children: {
                    $set: children,
                  },
                  data: {
                    sorted: {
                      $set: nextSort,
                    },
                    sortRule: {
                      $set: getLaneSortRule(nextSort),
                    },
                  },
                })
              );
            });
        });
      };

      if (lane.data.shouldMarkItemsComplete) {
        menu.addItem((item) => {
          if (lane.data.sortRule?.type === manualSortRule.type) {
            item.setIcon('lucide-check');
          }

          item.setTitle(t('Manual order'));
        });
      }

      menu.addItem((item) => {
        const nextSort =
          lane.data.sorted === LaneSort.TitleAsc ? LaneSort.TitleDsc : LaneSort.TitleAsc;
        const icon = getSortIcon(lane);

        if (icon) {
          item.setIcon(icon);
        } else {
          setSortIcon(
            item,
            lane.data.sorted,
            lane.data.sorted === LaneSort.TitleAsc ? LaneSort.TitleAsc : LaneSort.TitleDsc
          );
        }
        item
          .setTitle(
            lane.data.shouldMarkItemsComplete
              ? getSortTitle(
                  t('Card text'),
                  lane.data.sorted === LaneSort.TitleDsc ? 'desc' : 'asc'
                )
              : getIncompleteLaneSortTitle(t('Card text'))
          )
          .onClick(() => {
            const children = lane.children.slice();
            const isAsc = lane.data.sorted === LaneSort.TitleAsc;

            children.sort((a, b) => {
              if (isAsc) {
                return b.data.title.localeCompare(a.data.title);
              }

              return a.data.title.localeCompare(b.data.title);
            });

            boardModifiers.updateLane(
              path,
              update(lane, {
                children: {
                  $set: children,
                },
                data: {
                  sorted: {
                    $set: nextSort,
                  },
                  sortRule: {
                    $set: getLaneSortRule(nextSort),
                  },
                },
              })
            );
          });
      });

      if (canSortDate) {
        menu.addItem((item) => {
          const nextSort =
            lane.data.sorted === LaneSort.DateAsc ? LaneSort.DateDsc : LaneSort.DateAsc;
          const icon = getSortIcon(lane);

          if (icon) {
            item.setIcon(icon);
          } else {
            setSortIcon(
              item,
              lane.data.sorted,
              lane.data.sorted === LaneSort.DateAsc ? LaneSort.DateAsc : LaneSort.DateDsc
            );
          }
          item
            .setTitle(
              lane.data.shouldMarkItemsComplete
                ? getSortTitle(t('Date'), lane.data.sorted === LaneSort.DateDsc ? 'desc' : 'asc')
                : getIncompleteLaneSortTitle(t('Date'))
            )
            .onClick(() => {
              const children = lane.children.slice();
              const mod = lane.data.sorted === LaneSort.DateAsc ? -1 : 1;

              children.sort((a, b) => {
                const aDate: moment.Moment | undefined =
                  a.data.metadata.time || a.data.metadata.date;
                const bDate: moment.Moment | undefined =
                  b.data.metadata.time || b.data.metadata.date;

                if (aDate && !bDate) return -1 * mod;
                if (bDate && !aDate) return 1 * mod;
                if (!aDate && !bDate) return 0;

                return (aDate.isBefore(bDate) ? -1 : 1) * mod;
              });

              boardModifiers.updateLane(
                path,
                update(lane, {
                  children: {
                    $set: children,
                  },
                  data: {
                    sorted: {
                      $set: nextSort,
                    },
                    sortRule: {
                      $set: getLaneSortRule(nextSort),
                    },
                  },
                })
              );
            });
        });
      }

      if (canSortTags) {
        menu.addItem((item) => {
          const nextSort =
            lane.data.sorted === LaneSort.TagsAsc ? LaneSort.TagsDsc : LaneSort.TagsAsc;
          const icon = getSortIcon(lane);

          if (icon) {
            item.setIcon(icon);
          } else {
            setSortIcon(
              item,
              lane.data.sorted,
              lane.data.sorted === LaneSort.TagsAsc ? LaneSort.TagsAsc : LaneSort.TagsDsc
            );
          }
          item
            .setTitle(
              lane.data.shouldMarkItemsComplete
                ? getSortTitle(t('Tags'), lane.data.sorted === LaneSort.TagsDsc ? 'desc' : 'asc')
                : getIncompleteLaneSortTitle(t('Tags'))
            )
            .onClick(() => {
              const tagSortOrder = stateManager.getSetting('tag-sort');
              const children = lane.children.slice();
              const desc = lane.data.sorted === LaneSort.TagsAsc ? true : false;

              children.sort((a, b) => {
                const tagsA = a.data.metadata.tags;
                const tagsB = b.data.metadata.tags;

                if (!tagsA?.length && !tagsB?.length) return 0;
                if (!tagsA?.length) return 1;
                if (!tagsB?.length) return -1;

                const aSortOrder =
                  tagSortOrder?.findIndex((sort) => tagsA.includes(sort.tag)) ?? -1;
                const bSortOrder =
                  tagSortOrder?.findIndex((sort) => tagsB.includes(sort.tag)) ?? -1;

                if (aSortOrder > -1 && bSortOrder < 0) return desc ? 1 : -1;
                if (bSortOrder > -1 && aSortOrder < 0) return desc ? -1 : 1;
                if (aSortOrder > -1 && bSortOrder > -1) {
                  return desc ? bSortOrder - aSortOrder : aSortOrder - bSortOrder;
                }

                if (desc) return defaultSort(tagsB.join(''), tagsA.join(''));
                return defaultSort(tagsA.join(''), tagsB.join(''));
              });

              boardModifiers.updateLane(
                path,
                update(lane, {
                  children: {
                    $set: children,
                  },
                  data: {
                    sorted: {
                      $set: nextSort,
                    },
                    sortRule: {
                      $set: getLaneSortRule(nextSort),
                    },
                  },
                })
              );
            });
        });
      }

      if (canSortCreatedTime) {
        sortByTime(
          t('Created time'),
          (blockId) => getCardCreatedTime(board.data.settings, blockId),
          LaneSort.CreatedAsc,
          LaneSort.CreatedDsc
        );
      }

      if (canSortCompletedTime) {
        sortByTime(
          t('Completed time'),
          (blockId) => getCardCompletedTime(board.data.settings, blockId),
          LaneSort.CompletedAsc,
          LaneSort.CompletedDsc
        );
      }

      if (metadataSortOptions.size) {
        metadataSortOptions.forEach((k) => {
          menu.addItem((i) => {
            const nextSort = lane.data.sorted === k + '-asc' ? k + '-desc' : k + '-asc';
            const icon = getSortIcon(lane);

            if (icon) {
              i.setIcon(icon);
            } else {
              setSortIcon(
                i,
                lane.data.sorted,
                lane.data.sorted === k + '-asc' ? k + '-asc' : k + '-desc'
              );
            }
            i.setTitle(
              lane.data.shouldMarkItemsComplete
                ? getSortTitle(
                    lableToName(k).toLocaleLowerCase(),
                    lane.data.sorted === k + '-desc' ? 'desc' : 'asc'
                  )
                : getIncompleteLaneSortTitle(lableToName(k).toLocaleLowerCase())
            ).onClick(() => {
              const children = lane.children.slice();
              const desc = lane.data.sorted === k + '-asc' ? true : false;

              children.sort((a, b) => {
                const valA = a.data.metadata.inlineMetadata?.find((m) => m.key === k);
                const valB = b.data.metadata.inlineMetadata?.find((m) => m.key === k);

                if (valA === undefined && valB === undefined) return 0;
                if (valA === undefined) return 1;
                if (valB === undefined) return -1;

                if (desc) {
                  return defaultSort(
                    anyToString(valB.value, stateManager),
                    anyToString(valA.value, stateManager)
                  );
                }
                return defaultSort(
                  anyToString(valA.value, stateManager),
                  anyToString(valB.value, stateManager)
                );
              });

              boardModifiers.updateLane(
                path,
                update(lane, {
                  children: {
                    $set: children,
                  },
                  data: {
                    sorted: {
                      $set: nextSort,
                    },
                    sortRule: {
                      $set: getLaneSortRule(nextSort),
                    },
                  },
                })
              );
            });
          });
        });
      }
    };

    if (Platform.isPhone) {
      addSortOptions(menu);
    } else {
      menu.addItem((item) => {
        const submenu = (item as any).setTitle(t('Sort by')).setIcon('arrow-down-up').setSubmenu();

        addSortOptions(submenu);
      });
    }

    return menu;
  }, [
    stateManager,
    setConfirmAction,
    path,
    lane,
    completeLanesKey,
    showCreatedTime,
    showCompletedTime,
    board.data.settings.cards,
  ]);

  return {
    settingsMenu,
    confirmAction,
    setConfirmAction,
  };
}
