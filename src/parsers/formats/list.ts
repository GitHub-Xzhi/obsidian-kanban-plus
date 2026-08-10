import update from 'immutability-helper';
import { Content, List, Parent, Root } from 'mdast';
import { ListItem } from 'mdast-util-from-markdown/lib';
import { toString } from 'mdast-util-to-string';
import { stringifyYaml } from 'obsidian';
import { KanbanSettings, PersistedLaneSetting } from 'src/Settings';
import { StateManager } from 'src/StateManager';
import { generateInstanceId } from 'src/components/helpers';
import {
  Board,
  BoardTemplate,
  Item,
  ItemData,
  ItemTemplate,
  Lane,
  LaneTemplate,
} from 'src/components/types';
import { laneTitleWithMaxItems } from 'src/helpers';
import { defaultSort } from 'src/helpers/util';
import { t } from 'src/lang/helpers';
import { visit } from 'unist-util-visit';

import { archiveString, completeString, settingsToCodeblock } from '../common';
import { DateNode, FileNode, TimeNode, ValueNode } from '../extensions/types';
import {
  ContentBoundary,
  getNextOfType,
  getNodeContentBoundary,
  getPrevSibling,
  getStringFromBoundary,
} from '../helpers/ast';
import { hydrateItem, preprocessTitle } from '../helpers/hydrateBoard';
import { extractInlineFields, taskFields } from '../helpers/inlineMetadata';
import {
  addBlockId,
  dedentNewLines,
  executeDeletion,
  indentNewLines,
  markRangeForDeletion,
  parseLaneTitle,
  removeBlockId,
  replaceBrs,
  replaceNewLines,
} from '../helpers/parser';
import { parseFragment } from '../parseMarkdown';

interface TaskItem extends ListItem {
  checkChar?: string;
}

export function listItemToItemData(stateManager: StateManager, md: string, item: TaskItem) {
  const moveTags = stateManager.getSetting('move-tags');
  const moveDates = stateManager.getSetting('move-dates');

  const startNode = item.children.first();
  const endNode = item.children.last();

  const start =
    startNode.type === 'paragraph'
      ? getNodeContentBoundary(startNode).start
      : startNode.position.start.offset;
  const end =
    endNode.type === 'paragraph'
      ? getNodeContentBoundary(endNode).end
      : endNode.position.end.offset;
  const itemBoundary: ContentBoundary = { start, end };

  let itemContent = getStringFromBoundary(md, itemBoundary);

  // Handle empty task
  if (itemContent === '[' + (item.checked ? item.checkChar : ' ') + ']') {
    itemContent = '';
  }

  let title = itemContent;
  let titleSearch = '';

  visit(
    item,
    ['text', 'wikilink', 'embedWikilink', 'image', 'inlineCode', 'code', 'hashtag'],
    (node: any, i, parent) => {
      if (node.type === 'hashtag') {
        if (!parent.children.first()?.value?.startsWith('```')) {
          titleSearch += ' #' + node.value;
        }
      } else {
        titleSearch += node.value || node.alt || '';
      }
    }
  );

  const itemData: ItemData = {
    titleRaw: removeBlockId(dedentNewLines(replaceBrs(itemContent))),
    blockId: undefined,
    title: '',
    titleSearch,
    titleSearchRaw: titleSearch,
    metadata: {
      dateStr: undefined,
      date: undefined,
      time: undefined,
      timeStr: undefined,
      tags: [],
      fileAccessor: undefined,
      file: undefined,
      fileMetadata: undefined,
      fileMetadataOrder: undefined,
    },
    checked: item.checked,
    checkChar: item.checked ? item.checkChar || ' ' : ' ',
  };

  visit(
    item,
    (node) => {
      return node.type !== 'paragraph';
    },
    (node, i, parent) => {
      const genericNode = node as ValueNode;

      if (genericNode.type === 'blockid') {
        itemData.blockId = genericNode.value;
        return true;
      }

      if (
        genericNode.type === 'hashtag' &&
        !(parent.children.first() as any)?.value?.startsWith('```')
      ) {
        if (!itemData.metadata.tags) {
          itemData.metadata.tags = [];
        }

        itemData.metadata.tags.push('#' + genericNode.value);

        if (moveTags) {
          title = markRangeForDeletion(title, {
            start: node.position.start.offset - itemBoundary.start,
            end: node.position.end.offset - itemBoundary.start,
          });
        }
        return true;
      }

      if (genericNode.type === 'date' || genericNode.type === 'dateLink') {
        itemData.metadata.dateStr = (genericNode as DateNode).date;

        if (moveDates) {
          title = markRangeForDeletion(title, {
            start: node.position.start.offset - itemBoundary.start,
            end: node.position.end.offset - itemBoundary.start,
          });
        }
        return true;
      }

      if (genericNode.type === 'time') {
        itemData.metadata.timeStr = (genericNode as TimeNode).time;
        if (moveDates) {
          title = markRangeForDeletion(title, {
            start: node.position.start.offset - itemBoundary.start,
            end: node.position.end.offset - itemBoundary.start,
          });
        }
        return true;
      }

      if (genericNode.type === 'embedWikilink') {
        itemData.metadata.fileAccessor = (genericNode as FileNode).fileAccessor;
        return true;
      }

      if (genericNode.type === 'wikilink') {
        itemData.metadata.fileAccessor = (genericNode as FileNode).fileAccessor;
        itemData.metadata.fileMetadata = (genericNode as FileNode).fileMetadata;
        itemData.metadata.fileMetadataOrder = (genericNode as FileNode).fileMetadataOrder;
        return true;
      }

      if (genericNode.type === 'link' && (genericNode as FileNode).fileAccessor) {
        itemData.metadata.fileAccessor = (genericNode as FileNode).fileAccessor;
        itemData.metadata.fileMetadata = (genericNode as FileNode).fileMetadata;
        itemData.metadata.fileMetadataOrder = (genericNode as FileNode).fileMetadataOrder;
        return true;
      }

      if (genericNode.type === 'embedLink') {
        itemData.metadata.fileAccessor = (genericNode as FileNode).fileAccessor;
        return true;
      }
    }
  );

  itemData.title = preprocessTitle(stateManager, dedentNewLines(executeDeletion(title)));

  const firstLineEnd = itemData.title.indexOf('\n');
  const inlineFields = extractInlineFields(itemData.title, true);

  if (inlineFields?.length) {
    const inlineMetadata = (itemData.metadata.inlineMetadata = inlineFields.reduce((acc, curr) => {
      if (!taskFields.has(curr.key)) acc.push(curr);
      else if (firstLineEnd <= 0 || curr.end < firstLineEnd) acc.push(curr);

      return acc;
    }, []));

    const moveTaskData = stateManager.getSetting('move-task-metadata');
    const moveMetadata = stateManager.getSetting('inline-metadata-position') !== 'body';

    if (moveTaskData || moveMetadata) {
      let title = itemData.title;
      for (const item of [...inlineMetadata].reverse()) {
        const isTask = taskFields.has(item.key);

        if (isTask && !moveTaskData) continue;
        if (!isTask && !moveMetadata) continue;

        title = title.slice(0, item.start) + title.slice(item.end);
      }

      itemData.title = title;
    }
  }

  itemData.metadata.tags?.sort(defaultSort);

  return itemData;
}

function isArchiveLane(child: Content, children: Content[], currentIndex: number) {
  const headingText = toString(child, { includeImageAlt: false });

  if (child.type !== 'heading' || (headingText !== 'Archive' && headingText !== t('Archive'))) {
    return false;
  }

  const prev = getPrevSibling(children, currentIndex);

  return prev && prev.type === 'thematicBreak';
}

function sanitizeCompletedCardSources(
  sources: Record<string, any> | undefined
): KanbanSettings['completed-card-sources'] {
  if (!sources) {
    return undefined;
  }

  const nextSources = Object.entries(sources).reduce((acc, [blockId, source]) => {
    if (!source?.sourceLaneId) {
      return acc;
    }

    acc[blockId] = {
      sourceLaneId: source.sourceLaneId,
      sourceItemIndex: source.sourceItemIndex,
      movedAt: source.movedAt,
    };

    return acc;
  }, {} as NonNullable<KanbanSettings['completed-card-sources']>);

  return Object.keys(nextSources).length ? nextSources : undefined;
}

function sanitizeArchivedCardSources(
  sources: Record<string, any> | undefined
): KanbanSettings['archived-card-sources'] {
  if (!sources) {
    return undefined;
  }

  const nextSources = Object.entries(sources).reduce((acc, [blockId, source]) => {
    if (!source?.sourceLaneId) {
      return acc;
    }

    acc[blockId] = {
      sourceLaneId: source.sourceLaneId,
      sourceItemIndex: source.sourceItemIndex,
      archivedAt: source.archivedAt,
      archiveDateFormat: source.archiveDateFormat,
      archiveDateSeparator: source.archiveDateSeparator,
      archiveDateAfterTitle: source.archiveDateAfterTitle,
    };

    return acc;
  }, {} as NonNullable<KanbanSettings['archived-card-sources']>);

  return Object.keys(nextSources).length ? nextSources : undefined;
}

function buildRuntimeSettings(settings: KanbanSettings, collapseState: boolean[]): KanbanSettings {
  const rawSettings = settings as KanbanSettings & Record<string, any>;
  const {
    lanes: _persistedLanes,
    'lane-ids': _legacyLaneIds,
    'list-collapse': _legacyCollapseState,
    'default-complete-lane-title': _legacyDefaultCompleteLaneTitle,
    'default-complete-lane-titles': _legacyDefaultCompleteLaneTitles,
    ...runtimeSettings
  } = rawSettings;

  const nextSettings: KanbanSettings = {
    ...runtimeSettings,
    'completed-card-sources': sanitizeCompletedCardSources(rawSettings['completed-card-sources']),
    'archived-card-sources': sanitizeArchivedCardSources(rawSettings['archived-card-sources']),
    'list-collapse': collapseState,
  };

  if (!nextSettings['completed-card-sources']) {
    delete (nextSettings as Record<string, any>)['completed-card-sources'];
  }

  if (!nextSettings['archived-card-sources']) {
    delete (nextSettings as Record<string, any>)['archived-card-sources'];
  }

  return nextSettings;
}

function buildPersistedLaneSettings(board: Board): PersistedLaneSetting[] {
  const collapseState = board.data.settings['list-collapse'] || [];

  return board.children.map((lane, laneIndex) => ({
    id: lane.id,
    'list-collapse': !!collapseState[laneIndex],
  }));
}

function buildPersistedSettings(board: Board): KanbanSettings {
  const rawSettings = board.data.settings as KanbanSettings & Record<string, any>;
  const {
    lanes: _persistedLanes,
    'lane-ids': _legacyLaneIds,
    'list-collapse': _runtimeCollapseState,
    'default-complete-lane-title': _legacyDefaultCompleteLaneTitle,
    'default-complete-lane-titles': _legacyDefaultCompleteLaneTitles,
    ...persistedSettings
  } = rawSettings;

  const nextSettings: KanbanSettings = {
    ...persistedSettings,
    'completed-card-sources': sanitizeCompletedCardSources(rawSettings['completed-card-sources']),
    'archived-card-sources': sanitizeArchivedCardSources(rawSettings['archived-card-sources']),
    lanes: buildPersistedLaneSettings(board),
  };

  if (!nextSettings['completed-card-sources']) {
    delete (nextSettings as Record<string, any>)['completed-card-sources'];
  }

  if (!nextSettings['archived-card-sources']) {
    delete (nextSettings as Record<string, any>)['archived-card-sources'];
  }

  return nextSettings;
}

export function astToUnhydratedBoard(
  stateManager: StateManager,
  settings: KanbanSettings,
  frontmatter: Record<string, any>,
  root: Root,
  md: string
): Board {
  const lanes: Lane[] = [];
  const archive: Item[] = [];
  const persistedLanes = settings['lanes'] || [];
  const collapseState: boolean[] = [];
  let laneIndex = 0;
  root.children.forEach((child, index) => {
    if (child.type === 'heading') {
      const isArchive = isArchiveLane(child, root.children, index);
      const headingBoundary = getNodeContentBoundary(child as Parent);
      const title = getStringFromBoundary(md, headingBoundary);

      let shouldMarkItemsComplete = false;

      const list = getNextOfType(root.children, index, 'list', (child) => {
        if (child.type === 'heading') return false;

        if (child.type === 'paragraph') {
          const childStr = toString(child);

          if (childStr.startsWith('%% kanban:settings')) {
            return false;
          }

          if (childStr === 'Complete' || childStr === t('Complete')) {
            shouldMarkItemsComplete = true;
            return true;
          }
        }

        return true;
      });

      if (isArchive && list) {
        archive.push(
          ...(list as List).children.map((listItem) => {
            return {
              ...ItemTemplate,
              id: generateInstanceId(),
              data: listItemToItemData(stateManager, md, listItem),
            };
          })
        );

        return;
      }

      if (!list) {
        const persistedLane = persistedLanes[laneIndex];
        collapseState[laneIndex] = persistedLane?.['list-collapse'] ?? false;

        lanes.push({
          ...LaneTemplate,
          children: [],
          id: persistedLane?.id || generateInstanceId(),
          data: {
            ...parseLaneTitle(title),
            shouldMarkItemsComplete,
          },
        });
        laneIndex += 1;
      } else {
        const persistedLane = persistedLanes[laneIndex];
        collapseState[laneIndex] = persistedLane?.['list-collapse'] ?? false;

        lanes.push({
          ...LaneTemplate,
          children: (list as List).children.map((listItem) => {
            const data = listItemToItemData(stateManager, md, listItem);
            return {
              ...ItemTemplate,
              id: generateInstanceId(),
              data,
            };
          }),
          id: persistedLane?.id || generateInstanceId(),
          data: {
            ...parseLaneTitle(title),
            shouldMarkItemsComplete,
          },
        });
        laneIndex += 1;
      }
    }
  });

  return {
    ...BoardTemplate,
    id: stateManager.file.path,
    children: lanes,
    data: {
      settings: buildRuntimeSettings(settings, collapseState),
      frontmatter,
      archive,
      isSearching: false,
      errors: [],
    },
  };
}

export function updateItemContent(stateManager: StateManager, oldItem: Item, newContent: string) {
  const md = `- [${oldItem.data.checkChar}] ${addBlockId(indentNewLines(newContent), oldItem)}`;

  const ast = parseFragment(stateManager, md);
  const itemData = listItemToItemData(stateManager, md, (ast.children[0] as List).children[0]);
  const newItem = update(oldItem, {
    data: {
      $set: itemData,
    },
  });

  try {
    hydrateItem(stateManager, newItem);
  } catch (e) {
    console.error(e);
  }

  return newItem;
}

export function newItem(
  stateManager: StateManager,
  newContent: string,
  checkChar: string,
  forceEdit?: boolean
) {
  const md = `- [${checkChar}] ${indentNewLines(newContent)}`;
  const ast = parseFragment(stateManager, md);
  const itemData = listItemToItemData(stateManager, md, (ast.children[0] as List).children[0]);

  itemData.forceEditMode = !!forceEdit;

  const newItem: Item = {
    ...ItemTemplate,
    id: generateInstanceId(),
    data: itemData,
  };

  try {
    hydrateItem(stateManager, newItem);
  } catch (e) {
    console.error(e);
  }

  return newItem;
}

export function reparseBoard(stateManager: StateManager, board: Board) {
  try {
    return update(board, {
      children: {
        $set: board.children.map((lane) => {
          return update(lane, {
            children: {
              $set: lane.children.map((item) => {
                return updateItemContent(stateManager, item, item.data.titleRaw);
              }),
            },
          });
        }),
      },
    });
  } catch (e) {
    stateManager.setError(e);
    throw e;
  }
}

function itemToMd(item: Item) {
  return `- [${item.data.checkChar}] ${addBlockId(indentNewLines(item.data.titleRaw), item)}`;
}

function laneToMd(lane: Lane) {
  const lines: string[] = [];

  lines.push(`## ${replaceNewLines(laneTitleWithMaxItems(lane.data.title, lane.data.maxItems))}`);

  lines.push('');

  if (lane.data.shouldMarkItemsComplete) {
    lines.push(completeString);
  }

  lane.children.forEach((item) => {
    lines.push(itemToMd(item));
  });

  lines.push('');
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

function archiveToMd(archive: Item[]) {
  if (archive.length) {
    const lines: string[] = [archiveString, '', '## Archive', ''];

    archive.forEach((item) => {
      lines.push(itemToMd(item));
    });

    return lines.join('\n');
  }

  return '';
}

export function boardToMd(board: Board) {
  board = update(board, {
    data: {
      settings: {
        $set: buildPersistedSettings(board),
      },
    },
  });

  const lanes = board.children.reduce((md, lane) => {
    return md + laneToMd(lane);
  }, '');

  const frontmatter = ['---', '', stringifyYaml(board.data.frontmatter), '---', '', ''].join('\n');

  return frontmatter + lanes + archiveToMd(board.data.archive) + settingsToCodeblock(board);
}
