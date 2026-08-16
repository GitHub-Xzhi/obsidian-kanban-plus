import classcat from 'classcat';
import update from 'immutability-helper';
import { Menu, moment } from 'obsidian';
import { memo } from 'preact/compat';
import { useCallback, useContext, useMemo, useState } from 'preact/hooks';
import { KanbanSettings } from 'src/Settings';
import { getArchivedCardSource } from 'src/helpers/cardSettings';
import { t } from 'src/lang/helpers';

import { Icon } from '../Icon/Icon';
import { MetadataTable } from '../Item/MetadataTable';
import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import { KanbanContext } from '../context';
import { c } from '../helpers';
import { Item } from '../types';

interface ArchiveLaneProps {
  items: Item[];
  collapseDir: 'horizontal' | 'vertical';
}

interface ArchiveItemProps {
  item: Item;
  archiveIndex: number;
  cards: KanbanSettings['cards'];
  archiveDateFormat: string;
  showArchiveTime: boolean;
}

const ArchiveItem = memo(function ArchiveItem({
  item,
  archiveIndex,
  cards,
  archiveDateFormat,
  showArchiveTime,
}: ArchiveItemProps) {
  const { boardModifiers } = useContext(KanbanContext);
  const archivedAt = getArchivedCardSource({ cards }, item.data.blockId)?.archivedAt;
  const archiveTimeMetadata = useMemo(() => {
    if (!showArchiveTime || !archivedAt) {
      return null;
    }

    return {
      'card-archive-time': {
        metadataKey: 'card-archive-time',
        label: t('Archive time'),
        shouldHideLabel: false,
        containsMarkdown: false,
        value: moment(archivedAt).format(archiveDateFormat),
        format: archiveDateFormat,
      },
    };
  }, [archiveDateFormat, archivedAt, showArchiveTime]);

  const showMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();

      new Menu()
        .addItem((menuItem) => {
          menuItem
            .setIcon('lucide-undo-2')
            .setTitle(t('Unarchive card'))
            .onClick(() => boardModifiers.unarchiveItem(archiveIndex));
        })
        .showAtMouseEvent(e);
    },
    [archiveIndex, boardModifiers]
  );

  return (
    <div className={classcat([c('item-wrapper'), c('archive-item')])} onContextMenu={showMenu}>
      <div className={c('item')}>
        <div className={c('item-content-wrapper')}>
          <div className={c('item-title-wrapper')}>
            <MarkdownRenderer markdownString={item.data.title} />
            <div className={c('item-postfix-button-wrapper')}>
              <a
                data-ignore-drag={true}
                onPointerDown={(e) => e.preventDefault()}
                onClick={showMenu}
                className={`${c('item-postfix-button')} clickable-icon`}
                aria-label={t('More options')}
              >
                <Icon name="lucide-more-vertical" />
              </a>
            </div>
          </div>
          {archiveTimeMetadata && (
            <div className={c('item-metadata-wrapper')}>
              <MetadataTable metadata={archiveTimeMetadata} order={['card-archive-time']} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const ArchiveLane = memo(function ArchiveLane({ items, collapseDir }: ArchiveLaneProps) {
  const { boardModifiers, stateManager } = useContext(KanbanContext);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const cards = stateManager.useSetting('cards');
  const archiveDateFormat = stateManager.useSetting('archive-date-format');
  const showArchiveTime = !!stateManager.useSetting('show-card-archive-time-in-archive-lane');
  const showLaneMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();

      new Menu()
        .addItem((menuItem) => {
          menuItem
            .setIcon('lucide-archive')
            .setTitle(showArchiveTime ? t('Hide archive time') : t('Show archive time'))
            .onClick(() => {
              stateManager.setState((boardData) =>
                update(boardData, {
                  data: {
                    settings: {
                      'show-card-archive-time-in-archive-lane': {
                        $set: !showArchiveTime,
                      },
                    },
                  },
                })
              );
            });
        })
        .addSeparator()
        .addItem((menuItem) => {
          menuItem
            .setIcon('lucide-trash-2')
            .setTitle(t('Delete list'))
            .onClick(() => setIsConfirmingDelete(true));
        })
        .showAtMouseEvent(e);
    },
    [showArchiveTime, stateManager]
  );

  const onDeleteArchiveLane = useCallback(() => {
    boardModifiers.deleteArchiveLane();
    setIsConfirmingDelete(false);
  }, [boardModifiers]);

  return (
    <div
      className={classcat([
        c('lane-wrapper'),
        c('archive-lane-wrapper'),
        collapseDir === 'vertical' && c('archive-lane-wrapper-vertical'),
      ])}
    >
      <div className={classcat([c('lane'), c('archive-lane')])}>
        <div className={c('lane-header-wrapper')}>
          <div className={c('lane-title')}>
            <div className={c('lane-title-text')}>{t('Archive')}</div>
          </div>
          <div className={c('lane-title-count')}>{items.length}</div>
          <div className={c('lane-settings-button-wrapper')}>
            <a
              aria-label={t('More options')}
              className={`${c('lane-settings-button')} clickable-icon`}
              onClick={showLaneMenu}
            >
              <Icon name="lucide-more-vertical" />
            </a>
          </div>
        </div>
        {isConfirmingDelete && (
          <div className={c('action-confirm-wrapper')}>
            <div className={c('action-confirm-text')}>
              {t('Are you sure you want to delete this list and all its cards?')}
            </div>
            <div>
              <button onClick={onDeleteArchiveLane} className={c('confirm-action-button')}>
                {t('Yes, delete list')}
              </button>
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className={c('cancel-action-button')}
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
        )}
        <div className={classcat([c('lane-items'), c('vertical')])}>
          {items.map((item, archiveIndex) => (
            <ArchiveItem
              key={item.id}
              item={item}
              archiveIndex={archiveIndex}
              cards={cards}
              archiveDateFormat={archiveDateFormat}
              showArchiveTime={showArchiveTime}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
