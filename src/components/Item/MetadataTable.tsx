import classcat from 'classcat';
import { isPlainObject } from 'is-plain-object';
import { TFile, moment } from 'obsidian';
import { getAPI } from 'obsidian-dataview';
import { ComponentChild } from 'preact';
import { memo, useContext, useMemo } from 'preact/compat';
import { KanbanView } from 'src/KanbanView';
import { StateManager } from 'src/StateManager';
import { getCardCreatedTime, getCardCompletedTime } from 'src/helpers/cardSettings';
import { t } from 'src/lang/helpers';
import { InlineField, taskFields } from 'src/parsers/helpers/inlineMetadata';

import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import { KanbanContext } from '../context';
import { c, parseMetadataWithOptions, useGetDateColorFn } from '../helpers';
import { DataKey, FileMetadata, Item, PageData } from '../types';
import { Tags } from './ItemContent';

export interface ItemMetadataProps {
  item: Item;
  searchQuery?: string;
  shouldMarkItemsComplete?: boolean;
  showCreatedTime?: boolean;
  showCompletedTime?: boolean;
}

function mergeMetadata(
  fileMetadata: FileMetadata,
  inlineMetadata: InlineField[] = [],
  metadataKeys: DataKey[]
) {
  return inlineMetadata.reduce((acc, curr) => {
    if (taskFields.has(curr.key)) return acc;
    const data = parseMetadataWithOptions(curr, metadataKeys);

    acc[curr.key] = data;

    return acc;
  }, fileMetadata || {});
}

export function ItemMetadata({
  item,
  searchQuery,
  shouldMarkItemsComplete,
  showCreatedTime,
  showCompletedTime,
}: ItemMetadataProps) {
  const { stateManager } = useContext(KanbanContext);
  const mergeInlineMetadata =
    stateManager.useSetting('inline-metadata-position') === 'metadata-table';
  const metadataKeys = stateManager.useSetting('metadata-keys');
  const cards = stateManager.useSetting('cards');
  const showCardCreatedTime = stateManager.useSetting('show-card-created-time');
  const showCardCreatedTimeInCompleteLane = stateManager.useSetting(
    'show-card-created-time-in-complete-lane'
  );
  const showCardCompletedTimeInCompleteLane = stateManager.useSetting(
    'show-card-completed-time-in-complete-lane'
  );
  const cardCreatedTimeFormat = stateManager.useSetting('card-created-time-format');
  const cardCompletedTimeFormat = stateManager.useSetting('card-completed-time-format');
  const { fileMetadata, fileMetadataOrder, inlineMetadata } = item.data.metadata;
  const createdAt = getCardCreatedTime({ cards }, item.data.blockId);
  const completedAt = getCardCompletedTime({ cards }, item.data.blockId);
  const shouldShowCreatedTime =
    showCreatedTime ??
    (shouldMarkItemsComplete ? showCardCreatedTimeInCompleteLane : showCardCreatedTime);
  const shouldShowCompletedTime =
    showCompletedTime ?? (shouldMarkItemsComplete && showCardCompletedTimeInCompleteLane);

  const metadata = useMemo(() => {
    let metadata = mergeInlineMetadata
      ? mergeMetadata(fileMetadata, inlineMetadata, metadataKeys || [])
      : fileMetadata;

    if (shouldShowCreatedTime && createdAt) {
      metadata = {
        ...(metadata || {}),
        'card-created-time': {
          metadataKey: 'card-created-time',
          label: t('Created'),
          shouldHideLabel: false,
          containsMarkdown: false,
          value: moment(createdAt),
          format: cardCreatedTimeFormat,
        },
      };
    }

    if (shouldShowCompletedTime && completedAt) {
      metadata = {
        ...(metadata || {}),
        'card-completed-time': {
          metadataKey: 'card-completed-time',
          label: t('Completed'),
          shouldHideLabel: false,
          containsMarkdown: false,
          value: moment(completedAt),
          format: cardCompletedTimeFormat,
        },
      };
    }

    if (!metadata) return null;
    if (!Object.keys(metadata).length) return null;

    return metadata;
  }, [
    fileMetadata,
    inlineMetadata,
    metadataKeys,
    shouldShowCreatedTime,
    createdAt,
    cardCreatedTimeFormat,
    completedAt,
    shouldShowCompletedTime,
    cardCompletedTimeFormat,
  ]);

  const order = useMemo(() => {
    const metadataOrder = new Set(fileMetadataOrder || []);
    if (mergeInlineMetadata && inlineMetadata?.length) {
      inlineMetadata.forEach((m) => {
        if (!metadataOrder.has(m.key)) metadataOrder.add(m.key);
      });
    }

    if (shouldShowCreatedTime && createdAt) {
      metadataOrder.add('card-created-time');
    }

    if (shouldShowCompletedTime && completedAt) {
      metadataOrder.add('card-completed-time');
    }

    return Array.from(metadataOrder);
  }, [
    fileMetadataOrder,
    mergeInlineMetadata,
    inlineMetadata,
    shouldShowCreatedTime,
    createdAt,
    completedAt,
    shouldShowCompletedTime,
  ]);

  if (!metadata) {
    return null;
  }

  return (
    <div className={c('item-metadata-wrapper')}>
      <MetadataTable metadata={metadata} order={order} searchQuery={searchQuery} />
    </div>
  );
}

interface MetadataValueProps {
  data: PageData;
  dateLabel?: string;
  searchQuery?: string;
}

export function getDateFromObj(v: any, stateManager: StateManager) {
  let m: moment.Moment;

  if (v.ts) {
    m = moment(v.ts);
  } else if (moment.isMoment(v)) {
    m = v;
  } else if (v instanceof Date) {
    m = moment(v);
  }

  if (m) {
    const dateFormat = stateManager.getSetting(
      m.hours() === 0 ? 'date-display-format' : 'date-time-display-format'
    );

    return m.format(dateFormat);
  }

  return null;
}

export function getLinkFromObj(v: any, view: KanbanView) {
  if (typeof v !== 'object' || !v.path) return null;

  const file = app.vault.getAbstractFileByPath(v.path);
  if (file && file instanceof TFile) {
    const link = app.fileManager.generateMarkdownLink(file, view.file.path, v.subpath, v.display);
    return `${v.embed && link[0] !== '!' ? '!' : ''}${link}`;
  }

  return `${v.embed ? '!' : ''}[[${v.path}${v.display ? `|${v.display}` : ''}]]`;
}

function getDate(v: any) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = moment(v);
    if (d.isValid()) {
      return d;
    }
  }
  if (moment.isMoment(v)) return v;
  if (v instanceof Date) return moment(v);
  const dv = getAPI();
  if (dv?.value.isDate(v)) return moment(v.ts);
  return null;
}

export function anyToString(v: any, stateManager: StateManager): string {
  if (isPlainObject(v) && v.value) v = v.value;
  const date = getDate(v);
  if (date) return getDateFromObj(date, stateManager);
  if (typeof v === 'string') return v;
  if (v instanceof TFile) return v.path;
  if (Array.isArray(v)) {
    return v.map((v2) => anyToString(v2, stateManager)).join(' ');
  }
  if (v.rrule) return v.toText();
  const dv = getAPI();
  if (dv) return dv.value.toString(v);
  return `${v}`;
}

export function pageDataToString(data: PageData, stateManager: StateManager): string {
  return anyToString(data.value, stateManager);
}

export function MetadataValue({ data, dateLabel, searchQuery }: MetadataValueProps) {
  const { view, stateManager } = useContext(KanbanContext);
  const getDateColor = useGetDateColorFn(stateManager);

  const renderChild = (v: any, sep?: string) => {
    const link = getLinkFromObj(v, view);
    const date = getDate(v);
    const str = date && data.format ? date.format(data.format) : anyToString(v, stateManager);
    const isMatch = searchQuery && str.toLocaleLowerCase().contains(searchQuery);

    let content: ComponentChild;
    if (link || data.containsMarkdown) {
      content = (
        <MarkdownRenderer
          className="inline"
          markdownString={link ? link : str}
          searchQuery={searchQuery}
        />
      );
    } else if (date) {
      const dateColor = getDateColor(date);
      content = (
        <span
          className={classcat({
            [c('date')]: true,
            'is-search-match': isMatch,
            'has-background': dateColor?.backgroundColor,
          })}
          style={
            dateColor && {
              '--date-color': dateColor.color,
              '--date-background-color': dateColor.backgroundColor,
            }
          }
        >
          {!!dateLabel && <span className={c('item-metadata-date-label')}>{dateLabel}</span>}
          <span className={c('item-metadata-date')}>{str}</span>
        </span>
      );
    } else if (isMatch) {
      content = <span className="is-search-match">{str}</span>;
    } else {
      content = str;
    }

    return (
      <>
        {content}
        {sep ? <span>{sep}</span> : null}
      </>
    );
  };

  if (Array.isArray(data.value)) {
    return (
      <span className={classcat([c('meta-value'), 'mod-array'])}>
        {data.value.map((v, i, arr) => {
          return renderChild(v, i < arr.length - 1 ? ', ' : undefined);
        })}
      </span>
    );
  }

  return <span className={classcat([c('meta-value')])}>{renderChild(data.value)}</span>;
}

export interface MetadataTableProps {
  metadata: { [k: string]: PageData } | null;
  order?: string[];
  searchQuery?: string;
}

export const MetadataTable = memo(function MetadataTable({
  metadata,
  order,
  searchQuery,
}: MetadataTableProps) {
  const { stateManager } = useContext(KanbanContext);

  if (!metadata) return null;
  if (!order?.length) order = Object.keys(metadata);

  return (
    <table className={c('meta-table')}>
      <tbody>
        {order.map((k) => {
          const data = metadata[k];
          if (!data) return null;

          const isSearchMatch = (data.label || k).toLocaleLowerCase().contains(searchQuery);
          return (
            <tr key={k} className={c('meta-row')}>
              {!data.shouldHideLabel && (
                <td
                  className={classcat([
                    c('meta-key'),
                    {
                      'is-search-match': isSearchMatch,
                    },
                  ])}
                  data-key={k}
                >
                  <span>{data.label || k}</span>
                </td>
              )}
              <td
                colSpan={data.shouldHideLabel ? 2 : 1}
                className={c('meta-value-wrapper')}
                data-value={pageDataToString(data, stateManager)}
              >
                {k === 'tags' ? (
                  <Tags searchQuery={searchQuery} tags={data.value as string[]} alwaysShow />
                ) : (
                  <MetadataValue data={data} searchQuery={searchQuery} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});
